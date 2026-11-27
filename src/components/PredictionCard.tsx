"use client";

import React from "react";
import Image from "next/image";
import type { NDVIPredictionResult } from "@/src/types";

interface PredictionCardProps {
  data: NDVIPredictionResult;
  originalJpgUrl?: string | null;
  originalRawUrl?: string | null;
}

export const PredictionCard: React.FC<PredictionCardProps> = ({
  data,
  originalJpgUrl,
  originalRawUrl,
}) => {
  const isSehat = data.classification === "Sehat";
  const score = Number.isFinite(data.predictionScore)
    ? Math.min(100, Math.max(0, data.predictionScore * 100))
    : null;
  const confidencePercent = score === null ? null : score.toFixed(1);
  const ndviValue = data.ndvi !== null && Number.isFinite(data.ndvi)
    ? data.ndvi
    : null;

  return (
    <div
      className="bg-white rounded-2xl border border-[#ECECF2] overflow-hidden"
      style={{ boxShadow: "0 2px 8px rgba(15,23,42,0.04)" }}
    >

      <div className="px-5 py-4 border-b border-[#F0F0F3]">
        <h2 className="text-sm font-semibold text-[#1C1D21]">
          Hasil Capture Terbaru
        </h2>
      </div>


      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[#F0F0F3]">

        <div className="p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[#1C1D21]">
              {originalJpgUrl ? "Foto Asli MAPIR" : "JPG Hasil Preprocessing"}
            </span>
            <div className="flex items-center gap-3">
              {originalJpgUrl && (
                <a
                  href={originalJpgUrl}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[#8181A5] hover:text-[#6B8E23] transition-colors"
                >
                  Unduh JPG
                </a>
              )}
              {originalRawUrl && (
                <a
                  href={originalRawUrl}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[#8181A5] hover:text-[#6B8E23] transition-colors"
                >
                  Unduh RAW
                </a>
              )}
            </div>
          </div>
          {!originalJpgUrl && <p className="text-xs text-[#8181A5]">JPG asli tidak tersedia; menampilkan hasil preprocessing.</p>}
          <a href={data.snapshotThumbnail} target="_blank" rel="noopener noreferrer" className="block text-xs text-[#6B8E23] underline">Lihat JPG 720 × 720</a>
          <div className="relative aspect-square rounded-xl overflow-hidden border border-[#ECECF2] bg-[#0F172A]">
            <Image
              src={originalJpgUrl || data.snapshotThumbnail}
              alt={originalJpgUrl ? "Foto Asli MAPIR" : "JPG Hasil Preprocessing"}
              fill
              unoptimized
              className="object-contain"
            />
          </div>
        </div>


        <div className="p-5 space-y-4">
          <span className="text-xs font-semibold text-[#1C1D21]">
            Hasil Analisis
          </span>


          <div className="p-4 rounded-xl border border-[#ECECF2] bg-[#F6F6F6]">
            <p className="text-xs uppercase tracking-wide font-semibold text-[#8181A5] mb-2">
              Klasifikasi CNN
            </p>
            <p
              className={`text-3xl font-bold tracking-tight ${isSehat ? "text-[#6B8E23]" : "text-[#C8553D]"
                }`}
            >
              {data.classification}
            </p>
          </div>


          <div className="p-4 rounded-xl border border-[#ECECF2] bg-[#F6F6F6]">
            <p className="text-xs uppercase tracking-wide font-semibold text-[#8181A5] mb-2">
              Skor Prediksi CNN
            </p>
            <p className="text-3xl font-bold text-[#1C1D21] tracking-tight">
              {confidencePercent !== null ? `${confidencePercent}%` : "N/A"}
            </p>

            <div className="mt-2.5 w-full h-1 bg-[#ECECF2] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#6B8E23] rounded-full"
                style={{ width: `${score ?? 0}%` }}
              />
            </div>
          </div>


          <div className="p-4 rounded-xl border border-[#ECECF2] bg-[#F6F6F6]">
            <p className="text-xs uppercase tracking-wide font-semibold text-[#8181A5] mb-2">
              Nilai NDVI
            </p>
            <p className="text-3xl font-bold text-[#1C1D21] tracking-tight font-mono">
              {ndviValue !== null ? ndviValue.toFixed(4) : "N/A"}
            </p>
          </div>
        </div>
      </div>


      <div className="border-t border-[#F0F0F3]">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
          <h3 className="text-xs font-semibold text-[#1C1D21]">Visual NDVI</h3>
          <a
            href={data.snapshotNDVI}
            download
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[#6B8E23] underline"
          >
            Unduh NDVI (PNG)
          </a>
        </div>
        <div className="px-5 pb-5 pt-2 space-y-2">
          <div className="relative aspect-video rounded-xl overflow-hidden border border-[#ECECF2] bg-[#0F172A]">
            <Image
              src={data.snapshotNDVI}
              alt="Visual NDVI"
              fill
              unoptimized
              className="object-contain"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
