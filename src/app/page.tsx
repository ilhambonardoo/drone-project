"use client";

import { useState, useEffect, useRef } from "react";
import { PredictionCard } from "@/src/components/PredictionCard";
import { CameraPreview } from "@/src/components/CameraPreview";
import { NDVIPredictionResult, MapirHealthResponse, StoredPredictionResult } from "@/src/types";
import { getErrorMessage } from "@/src/lib/errors";

export default function Home() {
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [result, setResult] = useState<NDVIPredictionResult | null>(null);
  const [rawUrl, setRawUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jpgUrl, setJpgUrl] = useState<string | null>(null);

  useEffect(() => {
    const checkHealth = async () => {
      if (loading) return;
      try {
        const res = await fetch("/api/mapir/health");
        if (res.ok) {
          const data: MapirHealthResponse = await res.json();
          setIsCameraReady(Boolean(data.mapir?.ready && !data.capture_busy));
        } else {
          setIsCameraReady(false);
        }
      } catch {
        setIsCameraReady(false);
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 5000);
    return () => clearInterval(interval);
  }, [loading]);

  const [pendingId, setPendingId] = useState<string | null>(null);
  const active = useRef(false);
  const version = useRef(0);

  const applyResult = (data: StoredPredictionResult) => {
    setResult(data.mlResult);
    setJpgUrl(data.originalJpgUrl);
    setRawUrl(data.originalRawUrl);
  };

  useEffect(() => {
    let cancelled = false;
    const startVersion = version.current;
    const initialize = async () => {
      try {
        const pending = sessionStorage.getItem("dreampalm.pendingCaptureId");
        if (!cancelled && startVersion === version.current && pending && /^[A-Za-z0-9_-]{1,128}$/.test(pending)) setPendingId(pending);
      } catch { /* Storage may be disabled in the browser. */ }
      try {
        const res = await fetch("/api/predictions/latest", { cache: "no-store" });
        const data = await res.json();
        if (!cancelled && startVersion === version.current && res.ok && data.result) {
          setResult(data.result.mlResult);
          setJpgUrl(data.result.originalJpgUrl);
          setRawUrl(data.result.originalRawUrl);
        } else if (!cancelled && startVersion === version.current && !res.ok) {
          setError("Prediksi terakhir belum dapat dimuat.");
        }
      } catch {
        if (!cancelled && startVersion === version.current) setError("Prediksi terakhir belum dapat dimuat.");
      }
    };
    void initialize();
    return () => { cancelled = true; };
  }, []);

  const rememberCapture = (id: string | null) => {
    setPendingId(id);
    try {
      if (id) sessionStorage.setItem("dreampalm.pendingCaptureId", id);
      else sessionStorage.removeItem("dreampalm.pendingCaptureId");
    } catch { /* In-memory state is still available. */ }
  };

  const analyze = async (id: string) => {
    setStatusText("Menyimpan JPG & RAW, lalu menjalankan analisis CNN...");
    const res = await fetch(`/api/mapir/analyze/${encodeURIComponent(id)}`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Analisis gagal. Gunakan capture ID yang sama.");
    applyResult(data as StoredPredictionResult);
    rememberCapture(null);
  };

  const handleCaptureAndAnalyze = async () => {
    if (active.current || pendingId) return;
    active.current = true;
    version.current++;
    setLoading(true);
    setError(null);
    setStatusText("Mengirim perintah trigger ke MAPIR...");
    try {
      const res = await fetch("/api/mapir/capture", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Trigger gagal. Periksa kamera sebelum mengulang.");
      const id = data.capture_id;
      if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error("Capture ID tidak valid. Periksa kamera sebelum mengulang.");
      rememberCapture(id);
      setStatusText(`Memotret (${id})...`);
      const deadline = Date.now() + 120_000;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const poll = await fetch(`/api/mapir/status/${encodeURIComponent(id)}`, { cache: "no-store", signal: AbortSignal.timeout(25_000) });
        const status = await poll.json();
        if (!poll.ok) throw new Error(status.detail || "Gagal memeriksa status capture.");
        if (status.status === "failed") {
          rememberCapture(null);
          throw new Error("Pengambilan gambar MAPIR gagal.");
        }
        if (status.status === "completed") {
          await analyze(id);
          return;
        }
        setStatusText(`Status kamera: ${status.status}...`);
      }
      throw new Error("Polling mencapai batas waktu. Lanjutkan dengan capture ID yang sama.");
    } catch (error: unknown) {
      setError(getErrorMessage(error, "Proses capture & analisis gagal."));
    } finally {
      active.current = false;
      setLoading(false);
      setStatusText("");
    }
  };

  const retryAnalysis = async () => {
    if (!pendingId || active.current) return;
    if (!window.confirm("Pastikan analisis sebelumnya tidak lagi berjalan. Lanjutkan menggunakan capture ID yang sama?")) return;
    active.current = true;
    version.current++;
    setLoading(true);
    setError(null);
    try { await analyze(pendingId); }
    catch (error: unknown) { setError(getErrorMessage(error, "Analisis belum berhasil.")); }
    finally { active.current = false; setLoading(false); setStatusText(""); }
  };

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">
            Dashboard Kamera Multispektral DreamPalm
          </h1>
          <p className="text-gray-600 mt-2">
            Live framing &amp; akuisisi citra asli MAPIR Survey3
          </p>
        </div>

        <CameraPreview
          onTriggerCapture={handleCaptureAndAnalyze}
          loading={loading}
          statusText={statusText}
          isCameraReady={isCameraReady && !pendingId}
        />

        {error && (
          <div className="p-4 bg-red-50 text-red-700 border border-red-200 rounded-lg max-w-xl mx-auto text-sm text-center">
            {error}
          </div>
        )}

        {pendingId && !loading && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg max-w-xl mx-auto text-sm space-y-2 text-center">
            <p>Capture belum selesai dianalisis: {pendingId}</p>
            <button type="button" onClick={retryAnalysis} className="px-4 py-2 bg-green-700 text-white rounded-lg">Lanjutkan Analisis</button>
            <button type="button" onClick={() => { if (window.confirm("Berhenti melanjutkan capture ini di halaman? File dan metadata tidak akan dihapus.")) rememberCapture(null); }} className="block mx-auto underline text-gray-600">Lepas capture dari halaman</button>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <PredictionCard data={result} originalJpgUrl={jpgUrl} originalRawUrl={rawUrl} />
          </div>
        )}
      </div>
    </main>
  );
}
