"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { PredictionCard } from "@/src/components/PredictionCard";
import { CameraPreview } from "@/src/components/CameraPreview";
import { NDVIPredictionResult, MapirHealthResponse, StoredPredictionResult } from "@/src/types";
import { getErrorMessage } from "@/src/lib/errors";

function DpLogo() {
  return (
    <div className="flex items-center select-none shrink-0">
      <Image
        src="/logo-horizontal.png"
        alt="DreamPalm"
        width={120}
        height={38}
        className="h-7 w-auto object-contain"
        priority
      />
    </div>
  );
}


function EmptyCapture() {
  return (
    <div
      className="bg-white rounded-2xl border border-[#ECECF2] p-10 flex flex-col items-center justify-center text-center gap-3"
      style={{ boxShadow: "0 2px 8px rgba(15,23,42,0.04)" }}
    >
      <div className="w-12 h-12 rounded-xl bg-[#F5F5FA] border border-[#ECECF2] flex items-center justify-center">
        <svg
          className="w-6 h-6 text-[#8181A5]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
        </svg>
      </div>
      <div>
        <p className="text-sm font-semibold text-[#1C1D21]">
          Belum ada hasil capture
        </p>
        <p className="mt-1 text-xs text-[#8181A5]">
          Ambil foto untuk menjalankan analisis.
        </p>
      </div>
    </div>
  );
}


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
    <div className="min-h-screen bg-[#F5F5FA] flex flex-col">

      <header className="sticky top-0 z-30 bg-white border-b border-[#ECECF2] px-4 sm:px-6 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">

          <div className="flex items-center gap-2 min-w-0">
            <DpLogo />
            <span className="text-[#ECECF2] text-sm hidden sm:inline">/</span>
            <span className="text-sm text-[#8181A5] hidden sm:inline truncate">
              Pantau Drone
            </span>
          </div>


          <div
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border shrink-0 ${isCameraReady
              ? "bg-[#F0F7E6] text-[#6B8E23] border-[#6B8E23]/20"
              : "bg-[#FDF2F0] text-[#C8553D] border-[#C8553D]/20"
              }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${isCameraReady
                ? "bg-[#6B8E23] animate-pulse"
                : "bg-[#C8553D]"
                }`}
            />
            <span className="hidden sm:inline">
              {isCameraReady ? "MAPIR Terhubung" : "Kamera Offline"}
            </span>
            <span className="sm:hidden">
              {isCameraReady ? "Online" : "Offline"}
            </span>
          </div>
        </div>
      </header>


      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">

        <div>
          <h1 className="text-xl font-bold text-[#6B8E23]">Pantau Drone</h1>
          <p className="mt-0.5 text-sm text-[#8181A5]">
            Dasbor monitoring kamera multispektral dan analisis kondisi tanaman kelapa sawit berbasis CNN dan NDVI.
          </p>
        </div>


        {error && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-[#FDF2F0] border border-[#C8553D]/25 text-sm text-[#C8553D]">
            <svg
              className="w-4 h-4 shrink-0 mt-0.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p>{error}</p>
          </div>
        )}


        <CameraPreview
          onTriggerCapture={handleCaptureAndAnalyze}
          loading={loading}
          statusText={statusText}
          isCameraReady={isCameraReady}
          captureBlocked={Boolean(pendingId)}
        />


        {pendingId && !loading && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm space-y-3 text-center text-amber-900">
            <p>Capture belum selesai dianalisis: <span className="font-mono break-all">{pendingId}</span></p>
            <button type="button" onClick={retryAnalysis} className="px-4 py-2 bg-[#6B8E23] hover:bg-[#5a7a1c] text-white rounded-lg font-semibold">Lanjutkan Analisis</button>
            <button type="button" onClick={() => { if (window.confirm("Berhenti melanjutkan capture ini di halaman? File dan metadata tidak akan dihapus.")) rememberCapture(null); }} className="block mx-auto underline text-gray-600">Lepas capture dari halaman</button>
          </div>
        )}

        {result ? (
          <PredictionCard
            data={result}
            originalJpgUrl={jpgUrl}
            originalRawUrl={rawUrl}
          />
        ) : (
          <EmptyCapture />
        )}
      </main>


      <footer className="border-t border-[#ECECF2] bg-white py-4 px-6 text-center text-xs text-[#8181A5]">
        &copy; 2026 DreamPalm Project.
      </footer>
    </div>
  );
}
