import { z } from "zod";
import { noHtml, safeString } from "../enrichment/aiResponseSchema";

/**
 * ユーザーが端末へインポートするマスタJSONの厳格なスキーマ定義。
 * 攻略サイトのスクレイピング等は一切行わない。ユーザーが適法に用意した
 * ファイルを検証するためだけのものであり、HTML/スクリプトの混入・
 * 異常に長い文字列・不正なURLスキームを拒否する。
 */

export const MASTER_IMPORT_SUPPORTED_SCHEMA_VERSIONS = [1] as const;
/** 単一ファイルに含められる駒数の上限（安全のための上限であり、通常の運用では十分な余裕がある） */
export const MASTER_IMPORT_MAX_PIECES = 20_000;
/** インポート前のファイルサイズ上限（バイト） */
export const MASTER_IMPORT_MAX_BYTES = 20 * 1024 * 1024;

const NAME_MAX = 200;
const SAFE_STRING_MAX = 300;

const safeStringNullable = (max: number) => safeString(max).nullable();

const attributeSchema = z.enum(["神", "魔", "竜", "不明"]);
const raritySchema = z.enum(["N", "R", "SR", "S", "S+", "UR", "LR", "不明"]);
const evolutionTypeSchema = z.enum(["初期", "進化", "闘化", "神化", "真化", "覚醒", "不明"]);

const skillEffectImportSchema = z.object({
  skillType: safeString(NAME_MAX, 1),
  condition: safeStringNullable(SAFE_STRING_MAX),
  multiplier: z.number().finite().nullable(),
  turns: z.number().int().finite().nullable(),
  note: safeString(SAFE_STRING_MAX).optional(),
});

const nullableUrlSchema = z
  .string()
  .max(2000)
  .refine((u) => /^https?:\/\//i.test(u), "URLはhttp/httpsのみ許可されます")
  .refine(noHtml, "HTMLタグを含む文字列は許可されません")
  .nullable();

export const masterPieceImportSchema = z.object({
  pieceId: safeString(100, 1),
  fullName: safeString(NAME_MAX, 1),
  baseName: safeString(NAME_MAX, 1),
  epithet: safeStringNullable(NAME_MAX),
  attribute: attributeSchema,
  rarity: raritySchema,
  evolutionType: evolutionTypeSchema,
  skillName: safeStringNullable(NAME_MAX),
  skillData: z.array(skillEffectImportSchema).max(20),
  comboSkillName: safeStringNullable(NAME_MAX),
  comboSkillData: z.array(skillEffectImportSchema).max(20),
  sourceUrl: nullableUrlSchema,
  sourceUpdatedAt: z.string().nullable(),
  featureDataVersion: z.number().int().nonnegative(),
  masterVersion: safeString(100, 1),
});

export const masterImportFileSchema = z.object({
  schemaVersion: z.number().int(),
  game: z.literal("逆転オセロニア"),
  masterVersion: safeString(100, 1),
  generatedAt: z.string(),
  pieces: z.array(masterPieceImportSchema).max(MASTER_IMPORT_MAX_PIECES, "piecesが多すぎます"),
});

export type MasterPieceImport = z.infer<typeof masterPieceImportSchema>;
export type MasterImportFile = z.infer<typeof masterImportFileSchema>;

export interface MasterImportError {
  /** pieces配列内でのインデックス（トップレベルのエラーの場合はnull） */
  index: number | null;
  pieceId: string | null;
  field: string;
  message: string;
}

export type MasterImportValidationResult =
  | { ok: true; errors: []; data: MasterImportFile }
  | { ok: false; errors: MasterImportError[]; data?: undefined };

function extractPieceId(rawPieces: unknown, index: number): string | null {
  if (!Array.isArray(rawPieces)) return null;
  const raw = rawPieces[index];
  if (raw && typeof raw === "object" && "pieceId" in raw && typeof (raw as { pieceId: unknown }).pieceId === "string") {
    return (raw as { pieceId: string }).pieceId;
  }
  return null;
}

/**
 * マスタJSONを検証する。1件でも重大なスキーマエラーがある場合は、
 * 不正なレコードだけを黙って無視せず、全件インポートを中止する
 * （呼び出し側にエラー一覧を返し、ユーザーに提示する）。
 */
export function validateMasterImportFile(data: unknown): MasterImportValidationResult {
  if (typeof data !== "object" || data === null) {
    return { ok: false, errors: [{ index: null, pieceId: null, field: "(root)", message: "JSON全体がオブジェクトではありません" }] };
  }
  const rawSchemaVersion = (data as Record<string, unknown>).schemaVersion;
  if (
    typeof rawSchemaVersion !== "number" ||
    !(MASTER_IMPORT_SUPPORTED_SCHEMA_VERSIONS as readonly number[]).includes(rawSchemaVersion)
  ) {
    return {
      ok: false,
      errors: [
        {
          index: null,
          pieceId: null,
          field: "schemaVersion",
          message: `対応していないschemaVersionです（対応範囲: ${MASTER_IMPORT_SUPPORTED_SCHEMA_VERSIONS.join(", ")} / 実際: ${String(rawSchemaVersion)}）`,
        },
      ],
    };
  }

  const rawPieces = (data as Record<string, unknown>).pieces;
  const result = masterImportFileSchema.safeParse(data);
  if (!result.success) {
    const errors: MasterImportError[] = result.error.issues.map((issue) => {
      const [first, ...rest] = issue.path;
      const index = first === "pieces" && typeof rest[0] === "number" ? rest[0] : null;
      const field = index !== null ? rest.slice(1).join(".") || "(root)" : issue.path.join(".") || "(root)";
      return {
        index,
        pieceId: index !== null ? extractPieceId(rawPieces, index) : null,
        field,
        message: issue.message,
      };
    });
    return { ok: false, errors };
  }

  const seenIds = new Map<string, number>();
  const duplicateErrors: MasterImportError[] = [];
  result.data.pieces.forEach((piece, index) => {
    const firstIndex = seenIds.get(piece.pieceId);
    if (firstIndex !== undefined) {
      duplicateErrors.push({
        index,
        pieceId: piece.pieceId,
        field: "pieceId",
        message: `pieceIdが${firstIndex}番目の駒と重複しています`,
      });
    } else {
      seenIds.set(piece.pieceId, index);
    }
  });
  if (duplicateErrors.length > 0) {
    return { ok: false, errors: duplicateErrors };
  }

  return { ok: true, errors: [], data: result.data };
}
