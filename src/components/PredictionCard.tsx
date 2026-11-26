"use client";

import React from "react";
import Image from "next/image";
import { NDVIPredictionResult } from "@/src/types";

interface PredictionCardProps {
  data: NDVIPredictionResult;
  originalJpgUrl?: string | null;
  originalRawUrl?: string | null;
}

const NDVI_NORMAL_THRESHOLD = 0.3;

export const PredictionCard: React.FC<PredictionCardProps> = ({
  data,
  originalJpgUrl,
  originalRawUrl,
}) => {
  const isSehat = data.classification === "Sehat";
  const confidencePercent = (data.predictionScore * 100).toFixed(1);
  const hasNdvi = data.ndvi !== null && !Number.isNaN(data.ndvi);
  const isNdviNormal =
    hasNdvi && (data.ndvi as number) >= NDVI_NORMAL_THRESHOLD;

  const getSystemInterpretation = () => {
    if (!hasNdvi) {
      return {
        label: "⚠️ Data NDVI tidak valid",
        description:
          "Nilai NDVI tidak dapat dihitung dari piksel yang tersedia. Periksa pencahayaan atau file citra.",
        style: "bg-gray-50 border-gray-200 text-gray-800",
      };
    }
    if (isSehat && isNdviNormal) {
      return {
        label: "✅ Konsisten sehat",
        description:
          "Prediksi CNN (Sehat) searah dengan NDVI di atas ambang ilustratif; bukan validasi kesehatan tanaman.",
        style: "bg-green-50 border-green-200 text-green-800",
      };
    }
    if (!isSehat && !isNdviNormal) {
      return {
        label: "✅ Konsisten terindikasi",
        description:
          "Prediksi CNN (Terserang) disertai NDVI di bawah ambang ilustratif. Perlu verifikasi lapangan.",
        style: "bg-red-50 border-red-200 text-red-800",
      };
    }
    if (isSehat && !isNdviNormal) {
      return {
        label: "⚠️ Perlu verifikasi",
        description:
          "CNN mendeteksi kanopi Sehat, namun nilai NDVI tergolong rendah/abnormal. Disarankan pemeriksaan ulang di lapangan.",
        style: "bg-amber-50 border-amber-200 text-amber-800",
      };
    }
    return {
      label: "⚠️ Perlu verifikasi",
      description:
        "CNN mendeteksi gejala Terserang, namun nilai NDVI masih berada di batas normal. Disarankan pemeriksaan visual lebih lanjut.",
      style: "bg-amber-50 border-amber-200 text-amber-800",
    };
  };

  const interpretation = getSystemInterpretation();

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-6">
      {/* Header Status & Guardrail */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">
            Hasil Analisis Citra Multispektral
          </h2>
          <p className="text-xs text-gray-500">
            Model: {data.modelName} ({data.modelStatus}) • Piksel Valid:{" "}
            {data.validPixelPercentage === null ? "N/A" : `${data.validPixelPercentage.toFixed(1)}%`}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {!data.radiometricValidated && (
            <span className="px-2.5 py-1 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-full">
              ⚠️ Mode Radiometrik Sementara (JPG)
            </span>
          )}
          {!data.automaticSprayingAllowed && (
            <span className="px-2.5 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded-full">
              🛡️ Penyemprotan Otomatis Nonaktif
            </span>
          )}
        </div>
      </div>

      {/* Ringkasan Metrik Utama */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* 1. Klasifikasi CNN */}
        <div className="p-4 rounded-lg border border-gray-100 bg-gray-50">
          <p className="text-xs text-gray-500 uppercase font-semibold">
            Klasifikasi CNN
          </p>
          <p
            className={`mt-1 text-2xl font-bold ${
              isSehat ? "text-green-600" : "text-red-600"
            }`}
          >
            {data.classification}
          </p>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Threshold: {data.threshold}
          </p>
        </div>

        {/* 2. Skor Prediksi CNN */}
        <div className="p-4 rounded-lg border border-gray-100 bg-gray-50">
          <p className="text-xs text-gray-500 uppercase font-semibold">
            Skor Prediksi CNN
          </p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {confidencePercent}%
          </p>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Sehat: {data.scoreSehat.toFixed(3)} | Terserang:{" "}
            {data.scoreTerserang.toFixed(3)}
          </p>
        </div>

        {/* 3. Nilai NDVI */}
        <div className="p-4 rounded-lg border border-gray-100 bg-gray-50">
          <p className="text-xs text-gray-500 uppercase font-semibold">
            Nilai NDVI (Rata-rata)
          </p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {hasNdvi ? (data.ndvi as number).toFixed(4) : "N/A"}
          </p>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Status:{" "}
            {!hasNdvi
              ? "Tidak valid"
              : isNdviNormal
                ? "Di atas ambang (≥ 0.30)"
                : "Di bawah ambang (< 0.30)"}
          </p>
        </div>
      </div>

      {/* Rata-rata Kanal Spektral (Green, Red, NIR) */}
      <div className="grid grid-cols-3 gap-3 text-center bg-slate-50 p-3 rounded-lg border border-slate-100">
        <div>
          <span className="text-[11px] text-gray-500 block">Kanal Green</span>
          <span className="text-sm font-semibold text-emerald-700">
            {data.bands.green !== null ? data.bands.green.toFixed(4) : "-"}
          </span>
        </div>
        <div>
          <span className="text-[11px] text-gray-500 block">Kanal Red</span>
          <span className="text-sm font-semibold text-rose-700">
            {data.bands.red !== null ? data.bands.red.toFixed(4) : "-"}
          </span>
        </div>
        <div>
          <span className="text-[11px] text-gray-500 block">Kanal NIR</span>
          <span className="text-sm font-semibold text-indigo-700">
            {data.bands.nir !== null ? data.bands.nir.toFixed(4) : "-"}
          </span>
        </div>
      </div>

      {/* Catatan NDVI / Interpretasi Sistem */}
      <div className={`p-4 rounded-lg border ${interpretation.style}`}>
        <div className="flex flex-wrap items-center justify-between gap-1">
          <span className="font-bold text-sm">
            Catatan NDVI sementara: {interpretation.label}
          </span>
          <span className="text-xs opacity-80">
            CNN: {data.classification} | NDVI:{" "}
            {!hasNdvi ? "N/A" : isNdviNormal ? "Normal" : "Rendah/Abnormal"}
          </span>
        </div>
        <p className="text-xs mt-1.5 leading-relaxed">
          {interpretation.description}
        </p>
      </div>

      {/* Perbandingan Visual: Thumbnail Cepat & Visual NDVI (Heatmap) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Foto asli kamera */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-800">
              📷 Foto Asli Kamera
            </p>
            {originalJpgUrl && (
              <a
                href={originalJpgUrl}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-blue-600 hover:text-blue-800 underline"
              >
                ⬇️ Download JPG Asli
              </a>
            )}
          </div>
          {!originalJpgUrl && <p className="text-xs text-gray-500">JPG asli tidak tersedia; menampilkan hasil preprocessing.</p>}
          <a href={data.snapshotThumbnail} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 underline">Lihat JPG hasil preprocessing</a>
          <div className="relative aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-100">
            <Image
              src={originalJpgUrl || data.snapshotThumbnail}
              alt={originalJpgUrl ? "Foto Asli MAPIR" : "JPG Hasil Preprocessing"}
              fill
              unoptimized
              className="object-contain"
            />
          </div>
        </div>

        {/* Visual NDVI Heatmap */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-800">
              🌡️ Visual NDVI (Heatmap)
            </p>
            <a
              href={data.snapshotNDVI}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-blue-600 hover:text-blue-800 underline"
            >
              ⬇️ Download Heatmap
            </a>
          </div>
          <div className="relative aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-100">
            <Image
              src={data.snapshotNDVI}
              alt="Visual NDVI Heatmap"
              fill
              unoptimized
              className="object-contain"
            />
          </div>
        </div>
      </div>

      {/* Footer Info & Download File RAW */}
      <div className="pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2">
        {originalRawUrl && (
          <a
            href={originalRawUrl}
            download
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-lg transition"
          >
            📦 Unduh File RAW Asli
          </a>
        )}
      </div>
    </div>
  );
};
