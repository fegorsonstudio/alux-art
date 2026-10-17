/**
 * A road tile: the streets and buildings around a point, in local metres.
 * x runs east, z runs south (north is -z), y is up. The origin is the tile centre.
 */
export type RoadKind = "motorway" | "trunk" | "primary" | "secondary" | "tertiary" | "unclassified" | "residential" | "living_street" | "link";

export type TileRoad = {
  id: number;
  kind: RoadKind;
  name: string | null;
  oneway: boolean;
  /** OSM node ids, one per point: shared ids are where roads meet. */
  nodes: number[];
  /** [x, z] per point. */
  pts: [number, number][];
};

export type TileBuilding = {
  pts: [number, number][];
  height: number;
};

export type RoadTile = {
  key: string;
  lat: number;
  lng: number;
  radiusM: number;
  roads: TileRoad[];
  buildings: TileBuilding[];
  fetchedAt: string;
};

export const ROAD_WIDTH: Record<RoadKind, number> = {
  motorway: 18, trunk: 16, primary: 14, secondary: 11, tertiary: 9,
  unclassified: 7, residential: 7, living_street: 6, link: 7,
};

/** Equirectangular projection around a centre: metres per degree. */
export function projector(lat0: number, lng0: number) {
  const mx = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const mz = 110_540;
  return {
    toXZ: (lat: number, lng: number): [number, number] => [(lng - lng0) * mx, -(lat - lat0) * mz],
    toLatLng: (x: number, z: number): [number, number] => [lat0 - z / mz, lng0 + x / mx],
  };
}
