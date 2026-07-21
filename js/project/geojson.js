// project/geojson.js — сборка/разбор GeoJSON (участок + кварталы + дороги + внутр.).

import { state } from '../core/state.js';

const clone = (o) => JSON.parse(JSON.stringify(o));

// Собрать FeatureCollection из текущего состояния
export function buildGeoJSON() {
  const features = [];

  if (state.parcel) {
    const f = state.parcel.toGeoJSON();
    f.properties = Object.assign({}, f.properties, { role: 'parcel' });
    features.push(f);
  }

  state.blocks.forEach((b, i) => {
    const f = clone(b);
    f.properties = Object.assign({}, f.properties, {
      role: 'block',
      index: (b.properties && b.properties.index) || i + 1,
      zone: (b.properties && b.properties.zone) || 'residential'
    });
    features.push(f);
  });

  const pushRoad = (feat, roadType) => {
    if (!feat) return;
    const f = clone(feat);
    f.properties = Object.assign({}, f.properties, { role: 'road', roadType });
    features.push(f);
  };
  pushRoad(state.roadsMain, 'main');
  pushRoad(state.roadsLocal, 'local');
  pushRoad(state.roadsService, 'service');
  if (!state.roadsMain && !state.roadsLocal && !state.roadsService && state.roads) {
    const f = clone(state.roads);
    f.properties = Object.assign({}, f.properties, { role: 'road' });
    features.push(f);
  }

  state.roadAxes.forEach((ax) => {
    const f = clone(ax);
    f.properties = Object.assign({}, f.properties, {
      role: 'road', geomType: 'axis',
      roadType: (ax.properties && ax.properties.roadType) || 'local',
      width: (ax.properties && ax.properties.width) || 0,
      origin: (ax.properties && ax.properties.origin) || 'grid'
    });
    features.push(f);
  });

  state.innerRoads.forEach((ir) => {
    const f = clone(ir);
    f.properties = Object.assign({}, f.properties, {
      role: 'inner',
      zone: (ir.properties && ir.properties.zone) || 'residential',
      kind: (ir.properties && ir.properties.kind) || 'path'
    });
    features.push(f);
  });

  return { type: 'FeatureCollection', features };
}

// Разобрать FeatureCollection на группы по role
export function parseGeoJSON(geojson) {
  const groups = { parcel: null, blocks: [], roads: [], axes: [], inner: [] };
  if (!geojson || geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
    return { error: 'Ожидается FeatureCollection', groups };
  }

  for (const f of geojson.features) {
    if (!f || !f.geometry) continue;
    const role = f.properties && f.properties.role;
    if (role === 'parcel') groups.parcel = f;
    else if (role === 'block') groups.blocks.push(f);
    else if (role === 'inner') groups.inner.push(f);
    else if (role === 'road') {
      const isAxis = (f.properties && f.properties.geomType === 'axis') ||
        (f.geometry && (f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString'));
      if (isAxis) groups.axes.push(f); else groups.roads.push(f);
    }
  }

  // Фолбэк: нет ролей — первый полигон = участок
  if (!groups.parcel && groups.blocks.length === 0) {
    const polys = geojson.features.filter(f => f.geometry &&
      (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'));
    if (polys.length) {
      groups.parcel = polys[0];
      for (let i = 1; i < polys.length; i++) groups.blocks.push(polys[i]);
    }
  }

  return { error: groups.parcel ? null : 'Не найден участок (role: "parcel")', groups };
}
