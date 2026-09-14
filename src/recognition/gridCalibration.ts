import type { GridCalibration } from "../domain/types";
import { getGridCalibration, saveGridCalibration, gridCalibrationId } from "../db/database";
import { anchorsToGridConfig, defaultGridConfigFor, detectGridAnchors, type GridConfig, type GrayscaleSignal } from "./gridDetection";

/**
 * 画面サイズに応じたグリッド設定を決める優先順位:
 *   1) ユーザーが保存した調整値（同じ画面サイズ用に端末内保存、仕様書10章）
 *   2) 画像から自動検出した値
 *   3) 実測プリセットの比率スケーリング
 */
export async function resolveGridConfig(gray: GrayscaleSignal, width: number, height: number): Promise<GridConfig> {
  const saved = await getGridCalibration(width, height);
  if (saved) return calibrationToGridConfig(saved);

  try {
    const anchors = detectGridAnchors(gray);
    return anchorsToGridConfig(anchors);
  } catch {
    return defaultGridConfigFor(width, height);
  }
}

export function calibrationToGridConfig(calibration: GridCalibration): GridConfig {
  return {
    columns: calibration.columns,
    gridTop: calibration.gridTop,
    rowPitch: calibration.rowPitch,
    colCenters: calibration.colCenters,
    cellSize: calibration.cellSize,
    navBarTop: calibration.navBarTop,
  };
}

export function gridConfigToCalibration(config: GridConfig, width: number, height: number): GridCalibration {
  return {
    id: gridCalibrationId(width, height),
    screenWidth: width,
    screenHeight: height,
    columns: config.columns,
    gridTop: config.gridTop,
    rowPitch: config.rowPitch,
    colCenters: config.colCenters,
    cellSize: config.cellSize,
    navBarTop: config.navBarTop,
    updatedAt: new Date().toISOString(),
  };
}

export async function persistGridConfig(config: GridConfig, width: number, height: number): Promise<void> {
  await saveGridCalibration(gridConfigToCalibration(config, width, height));
}

export { getGridCalibration };
