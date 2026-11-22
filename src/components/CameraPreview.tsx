"use client";

import React from "react";

interface CameraPreviewProps {
  onTriggerCapture: () => void;
  loading: boolean;
  statusText: string;
  isCameraReady: boolean;
}

export const CameraPreview: React.FC<CameraPreviewProps> = ({
  onTriggerCapture,
  loading,
  statusText,
  isCameraReady,
}) => {
  const streamUrl =
    process.env.NEXT_PUBLIC_MAPIR_STREAM_URL ||
    "https://stream.dreampalm.id/dreampalm/";

  return (
    <div className="space-y-4 max-w-xl mx-auto text-center">
      <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-black aspect-video flex items-center justify-center">
        <iframe
          src={streamUrl}
          title="MAPIR Live Framing Preview"
          allow="autoplay; fullscreen"
          className="w-full h-full border-0 pointer-events-none"
        />

        <span
          className={`absolute top-3 left-3 px-2.5 py-1 text-xs font-medium rounded-md backdrop-blur-sm ${
            isCameraReady
              ? "bg-green-950/80 text-green-300 border border-green-500/30"
              : "bg-amber-950/80 text-amber-300 border border-amber-500/30"
          }`}
        >
          {isCameraReady ? "🟢 MAPIR Ready" : "🟡 Menunggu MAPIR / Sibuk"}
        </span>

        {loading && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 backdrop-blur-[2px]"
            role="status"
            aria-live="polite"
            aria-label={statusText || "Sedang memproses capture"}
          >
            <div className="flex max-w-[80%] flex-col items-center gap-3 rounded-xl border border-white/15 bg-black/60 px-6 py-5 text-white shadow-xl">
              <span
                className="h-10 w-10 animate-spin rounded-full border-4 border-white/25 border-t-white"
                aria-hidden="true"
              />
              <div>
                <p className="font-semibold">Tunggu Sebentar</p>
                <p className="mt-1 text-sm text-white/75">
                  {statusText || "Mohon tunggu..."}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Jalur 2: Tombol Capture via Next.js Server Proxy */}
      <button
        type="button"
        onClick={onTriggerCapture}
        disabled={loading || !isCameraReady}
        className="w-full py-3 bg-green-600 cursor-pointer text-white font-semibold rounded-lg hover:bg-green-700 disabled:opacity-70 disabled:cursor-not-allowed transition shadow-sm"
      >
        {loading ? (
          <span className="inline-flex items-center justify-center gap-2">
            <span
              className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
              aria-hidden="true"
            />
            Memproses...
          </span>
        ) : (
          "📸 Ambil Foto & Analisis"
        )}
      </button>
    </div>
  );
};
