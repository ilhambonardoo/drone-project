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
  const ndviValue = hasNdvi ? (data.ndvi as number) : null;
  const isNdviNormal = ndviValue !== null && ndviValue >= NDVI_NORMAL_THRESHOLD;

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
          "Prediksi CNN Sehat, namun NDVI berada di bawah ambang ilustratif. Disarankan pemeriksaan ulang di lapangan.",
        style: "bg-amber-50 border-amber-200 text-amber-800",
      };
    }
    return {
      label: "⚠️ Perlu verifikasi",
      description:
        "Prediksi CNN Terserang, namun NDVI berada di atas ambang ilustratif. Disarankan pemeriksaan visual lebih lanjut.",
      style: "bg-amber-50 border-amber-200 text-amber-800",
    };
  };

  const interpretation = getSystemInterpretation();

  return (
    <div
      className="bg-white rounded-2xl border border-[#ECECF2] overflow-hidden"
      style={{ boxShadow: "0 2px 8px rgba(15,23,42,0.04)" }}
    >

      <div className="px-5 py-4 border-b border-[#F0F0F3]">
        <h2 className="text-sm font-semibold text-[#1C1D21]">
          Hasil Capture Terbaru
        </h2>
        <p className="mt-0.5 text-xs text-[#8181A5]">{data.filename || data.predictionId}</p>
        <p className="mt-1 text-xs text-[#8181A5] break-words">
          Model: {data.modelName} ({data.modelStatus}) · Piksel valid: {data.validPixelPercentage === null ? "N/A" : `${data.validPixelPercentage.toFixed(1)}%`}
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {!data.radiometricValidated && <span className="rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 text-amber-800">Radiometrik sementara (JPG)</span>}
          {!data.physicalCoverageValidated && <span className="rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 text-amber-800">Cakupan fisik belum tervalidasi</span>}
          {!data.automaticSprayingAllowed && <span className="rounded-full bg-[#F5F5FA] border border-[#ECECF2] px-2.5 py-1 text-[#1C1D21]">Penyemprotan otomatis nonaktif</span>}
        </div>
      </div>


      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[#F0F0F3]">

        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between">
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
          <a href={data.snapshotThumbnail} target="_blank" rel="noopener noreferrer" className="block text-xs text-[#6B8E23] underline">Lihat JPG hasil preprocessing</a>
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
            <p className="mt-1 text-xs text-[#8181A5]">Threshold CNN: {data.threshold}</p>
          </div>


          <div className="p-4 rounded-xl border border-[#ECECF2] bg-[#F6F6F6]">
            <p className="text-xs uppercase tracking-wide font-semibold text-[#8181A5] mb-2">
              Skor Prediksi CNN
            </p>
            <p className="text-3xl font-bold text-[#1C1D21] tracking-tight">
              {confidencePercent}%
            </p>

            <p className="mt-1 text-xs text-[#8181A5]">Sehat: {data.scoreSehat.toFixed(3)} · Terserang: {data.scoreTerserang.toFixed(3)}</p>
            {!data.scoreCalibrated && <p className="mt-1 text-xs text-amber-800">Skor belum terkalibrasi; bukan probabilitas kesehatan atau akurasi model.</p>}
            <div className="mt-2.5 w-full h-1 bg-[#ECECF2] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#6B8E23] rounded-full"
                style={{ width: `${confidencePercent}%` }}
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
            <p className="mt-1.5 text-xs text-[#8181A5]">
              Informasi vegetasi tambahan; ambang ilustratif 0,30.
              {ndviValue === null ? " Tidak valid." : isNdviNormal ? " Di atas atau sama dengan ambang." : " Di bawah ambang."}
            </p>
          </div>
        </div>
      </div>


      <div className="px-5 py-4 border-t border-[#F0F0F3] space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center rounded-xl bg-[#F5F5FA] p-3">
          {([['Green', data.bands.green], ['Red', data.bands.red], ['NIR', data.bands.nir]] as const).map(([label, value]) => (
            <div key={label}>
              <p className="text-xs text-[#8181A5]">Kanal {label}</p>
              <p className="text-sm font-semibold text-[#1C1D21]">{value === null ? "N/A" : value.toFixed(4)}</p>
            </div>
          ))}
        </div>
        <div className={`p-3 rounded-xl border ${interpretation.style}`}>
          <p className="text-sm font-semibold">Catatan NDVI sementara: {interpretation.label}</p>
          <p className="text-xs mt-1">{interpretation.description}</p>
        </div>
        <p className="text-xs text-[#8181A5] break-words">
          Mode radiometrik: {data.radiometricMode} · Target cakupan: {data.physicalCoverageTargetMeters === null ? "N/A" : `${data.physicalCoverageTargetMeters} m`}
        </p>
      </div>

      <details className="border-t border-[#F0F0F3] group">
        <summary className="flex items-center justify-between px-5 py-3 cursor-pointer select-none list-none text-xs text-[#8181A5] hover:text-[#1C1D21] transition-colors">
          <span className="font-medium">Visual NDVI</span>
          <span className="flex items-center gap-1 text-[11px] text-[#8181A5]">
            Visualisasi tambahan
            <svg
              className="w-3.5 h-3.5 transition-transform group-open:rotate-180"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        </summary>
        <div className="px-5 pb-5 pt-2 space-y-2">
          <a href={data.snapshotNDVI} download target="_blank" rel="noopener noreferrer" className="block text-xs text-[#6B8E23] underline">Unduh visual NDVI (PNG)</a>
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
      </details>
    </div>
  );
};
