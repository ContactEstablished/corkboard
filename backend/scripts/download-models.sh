#!/usr/bin/env bash
# Downloads the Parakeet TDT 0.6B v3 (int8) speech model for sherpa-onnx into models/.
# Usage: scripts/download-models.sh [models-dir]   (default: backend/models)
# Model license: CC-BY-4.0 (NVIDIA). See README.md.
set -euo pipefail

NAME="sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8"
URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/${NAME}.tar.bz2"
MODELS_DIR="${1:-$(cd "$(dirname "$0")/.." && pwd)/models}"
TARGET="${MODELS_DIR}/parakeet-tdt-0.6b-v3-int8"
FILES=(encoder.int8.onnx decoder.int8.onnx joiner.int8.onnx tokens.txt)

complete() {
  for f in "${FILES[@]}"; do [[ -s "${TARGET}/${f}" ]] || return 1; done
}

if complete; then
  echo "Model already present in ${TARGET}"
  exit 0
fi

mkdir -p "${MODELS_DIR}"
ARCHIVE="${MODELS_DIR}/${NAME}.tar.bz2"
echo "Downloading ${URL}"
curl -fL --retry 3 -o "${ARCHIVE}.part" "${URL}"
mv "${ARCHIVE}.part" "${ARCHIVE}"

echo "Extracting"
tar -xjf "${ARCHIVE}" -C "${MODELS_DIR}"
mkdir -p "${TARGET}"
for f in "${FILES[@]}"; do mv -f "${MODELS_DIR}/${NAME}/${f}" "${TARGET}/${f}"; done
rm -r "${MODELS_DIR:?}/${NAME:?}"
rm "${ARCHIVE}"

complete || { echo "Extraction did not produce the expected files" >&2; exit 1; }
echo "Model ready in ${TARGET}"
