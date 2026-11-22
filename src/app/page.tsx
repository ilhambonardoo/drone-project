"use client";

import { useState, useEffect } from "react";
import { PredictionCard } from "@/src/components/PredictionCard";
import { CameraPreview } from "@/src/components/CameraPreview";
import { NDVIPredictionResult, MapirHealthResponse } from "@/src/types";
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

  const handleCaptureAndAnalyze = async () => {
    setLoading(true);
    setError(null);
    setStatusText("Mengirim perintah trigger ke MAPIR...");

    try {
      const triggerRes = await fetch("/api/mapir/capture", { method: "POST" });
      const triggerData = await triggerRes.json();

      if (!triggerRes.ok) {
        const msg =
          typeof triggerData.detail === "object"
            ? triggerData.detail.message
            : triggerData.detail;
        throw new Error(msg || "Gagal memicu capture MAPIR.");
      }

      const captureId = triggerData.capture_id;
      setStatusText(`Memotret (${captureId})...`);

      let completed = false;
      while (!completed) {
        await new Promise((resolve) => setTimeout(resolve, 1500));

        const pollRes = await fetch(`/api/mapir/status/${captureId}`);
        const pollData = await pollRes.json();

        if (!pollRes.ok) {
          throw new Error(pollData.detail || "Gagal memeriksa status capture.");
        }

        if (pollData.status === "failed") {
          throw new Error("Proses pengambilan gambar di kamera MAPIR gagal.");
        }

        if (pollData.status === "completed") {
          completed = true;
          setStatusText("Capture selesai. Menyiapkan hasil analisis...");
          setResult(pollData.mlResult);
          setJpgUrl(pollData.originalJpgUrl || null);
          setRawUrl(pollData.originalRawUrl || null);
        } else {
          setStatusText(`Status kamera: ${pollData.status}...`);
        }
      }
    } catch (error: unknown) {
      setError(
        getErrorMessage(
          error,
          "Terjadi kesalahan saat proses capture & analisis.",
        ),
      );
    } finally {
      setLoading(false);
      setStatusText("");
    }
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
          isCameraReady={isCameraReady}
        />

        {error && (
          <div className="p-4 bg-red-50 text-red-700 border border-red-200 rounded-lg max-w-xl mx-auto text-sm text-center">
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <PredictionCard data={result} originalJpgUrl={jpgUrl} />{" "}
            {rawUrl && (
              <div className="text-center">
                <a
                  href={rawUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-xs text-blue-600 hover:underline"
                >
                  ⬇️ Unduh File RAW Asli (18 MB)
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
