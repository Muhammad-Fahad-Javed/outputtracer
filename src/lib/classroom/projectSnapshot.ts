import { inspectDosboxAssets, type DosboxAssets } from "@/lib/dosboxAssets";

/** Reserved metadata in the existing immutable JSON payload, never an editor file. */
export const DOSBOX_ASSET_MANIFEST = "__outputtracer_dos_assets_v1__";

export function sourceFilesOnly(files: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(files).filter(([name]) => name !== DOSBOX_ASSET_MANIFEST));
}

export function snapshotInputAssets(files: Record<string, string>): DosboxAssets {
  const encoded = files[DOSBOX_ASSET_MANIFEST];
  if (encoded === undefined) return {};
  let assets: unknown;
  try { assets = JSON.parse(encoded); } catch { throw new Error("Invalid immutable input-file manifest."); }
  const inspected = inspectDosboxAssets(assets);
  if (!inspected.ok) throw new Error(inspected.message);
  return assets as DosboxAssets;
}

/** Hashing and storage include assets; source analysis excludes this manifest. */
export function packProjectSnapshot(files: Record<string, string>, assets: DosboxAssets = {}): Record<string, string> {
  if (Object.hasOwn(files, DOSBOX_ASSET_MANIFEST)) throw new Error("Reserved project metadata cannot be a source file.");
  const inspected = inspectDosboxAssets(assets);
  if (!inspected.ok) throw new Error(inspected.message);
  if (Object.keys(assets).length === 0) return { ...files };
  const canonical = Object.fromEntries(Object.entries(assets).sort(([a], [b]) => a.localeCompare(b)).map(([name, asset]) => [name, { base64: asset.base64 }]));
  return { ...files, [DOSBOX_ASSET_MANIFEST]: JSON.stringify(canonical) };
}

export function projectSnapshotView(files: Record<string, string>) {
  return {
    files: sourceFilesOnly(files),
    inputAssets: snapshotInputAssets(files),
    contentHashScope: Object.hasOwn(files, DOSBOX_ASSET_MANIFEST) ? "source_and_input_assets_v1" : "source_files",
  };
}
