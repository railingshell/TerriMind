import { P as PROJECT_FORMAT_VERSION, n as nowISO, g as generateId } from "./index-C69aT8do.js";
function migrateProject(raw) {
  const fromVersion = raw.version ?? "0.0.0";
  const warnings = [];
  const errors = [];
  const lostFields = [];
  let p = raw;
  if (compareVersions(fromVersion, "3.0.0") < 0) {
    p = migrate_to_3(p, warnings);
  }
  if (compareVersions(fromVersion, "4.0.0") < 0) {
    p = migrate_to_4(p, warnings);
  }
  if (compareVersions(fromVersion, "5.0.0") < 0) {
    p = migrate_to_5(p, warnings);
  }
  const project = ensureArrays(p);
  project.version = PROJECT_FORMAT_VERSION;
  return {
    project,
    result: {
      success: errors.length === 0,
      fromVersion,
      toVersion: PROJECT_FORMAT_VERSION,
      warnings,
      errors,
      lostFields
    }
  };
}
function migrate_to_3(p, w, _l) {
  w.push("Применена миграция v2→v3: добавлены нормативные профили");
  return {
    ...p,
    normativeProfiles: p.normativeProfiles ?? [],
    activeProfileId: p.activeProfileId ?? "",
    scenarios: p.scenarios ?? [{ id: generateId(), name: "Базовый", isBase: true, createdAt: nowISO(), description: "" }]
  };
}
function migrate_to_4(p, w, _l) {
  w.push("Применена миграция v3→v4: добавлена 3D-конфигурация и квартирография");
  return { ...p };
}
function migrate_to_5(p, w, _l) {
  w.push("Применена миграция v4→v5: добавлены земельные участки, инфраструктура, парковки, ограничения, рельеф, сети");
  const now = nowISO();
  return {
    ...p,
    parcels: p.parcels ?? [],
    infrastructureObjects: p.infrastructureObjects ?? [],
    externalInfrastructure: p.externalInfrastructure ?? [],
    parkingFacilities: p.parkingFacilities ?? [],
    parkingRules: p.parkingRules ?? [],
    transitStops: p.transitStops ?? [],
    mobilityGraphNodes: p.mobilityGraphNodes ?? [],
    mobilityGraphEdges: p.mobilityGraphEdges ?? [],
    constraints: p.constraints ?? [],
    spatialConflicts: p.spatialConflicts ?? [],
    userConflictResolutions: p.userConflictResolutions ?? [],
    terrainFiles: p.terrainFiles ?? [],
    elevationPoints: p.elevationPoints ?? [],
    designSurfaces: p.designSurfaces ?? [],
    utilities: p.utilities ?? [],
    utilityConnectionPoints: p.utilityConnectionPoints ?? [],
    calculationModelVersions: {
      ...p.calculationModelVersions ?? {},
      parcels: "5.0",
      infrastructure: "5.0",
      accessibility: "5.0",
      parking: "5.0",
      terrain: "5.0"
    },
    dataQualityLog: p.dataQualityLog ?? [],
    updatedAt: now
  };
}
function ensureArrays(p) {
  const arrayFields = [
    "blocks",
    "buildings",
    "roads",
    "zones",
    "parcels",
    "infrastructureObjects",
    "externalInfrastructure",
    "parkingFacilities",
    "parkingRules",
    "transitStops",
    "mobilityGraphNodes",
    "mobilityGraphEdges",
    "constraints",
    "spatialConflicts",
    "userConflictResolutions",
    "terrainFiles",
    "elevationPoints",
    "designSurfaces",
    "utilities",
    "utilityConnectionPoints",
    "normativeProfiles",
    "scenarios",
    "dataQualityLog"
  ];
  const result = { ...p };
  for (const f of arrayFields) {
    if (!Array.isArray(result[f])) result[f] = [];
  }
  if (!result.crs) result.crs = { originLng: 0, originLat: 0, rotation: 0 };
  return result;
}
function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
function validateProjectJson(raw) {
  const errors = [];
  if (typeof raw !== "object" || raw === null) {
    errors.push("Файл проекта не является объектом JSON");
    return { valid: false, errors };
  }
  const obj = raw;
  if (typeof obj.id !== "string") errors.push("Отсутствует поле id");
  if (typeof obj.name !== "string") errors.push("Отсутствует поле name");
  if (typeof obj.version !== "string") errors.push("Отсутствует поле version");
  if (typeof obj.version === "string") {
    const { compareVersions: cv } = { compareVersions };
    if (cv(obj.version, PROJECT_FORMAT_VERSION) > 0) {
      errors.push(`Версия файла ${obj.version} новее, чем поддерживаемая ${PROJECT_FORMAT_VERSION}. Обновите TerriMind.`);
    }
  }
  return { valid: errors.length === 0, errors };
}
export {
  migrateProject,
  validateProjectJson
};
