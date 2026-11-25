"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { PredictionCard } from "@/src/components/PredictionCard";
import { CameraPreview } from "@/src/components/CameraPreview";
import { NDVIPredictionResult, MapirHealthResponse } from "@/src/types";
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
    } catch (err: unknown) {
      setError(
        getErrorMessage(err, "Terjadi kesalahan saat proses capture & analisis.")
      );
    } finally {
      setLoading(false);
      setStatusText("");
    }
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
        />


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
