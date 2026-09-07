import snapshot from "../../../data/geography/stations.v1.json";
import { parseGeoSnapshot } from "./schema";

/** Factual reference geography for presentation only. Never a planning input. */
export const stationGeography = parseGeoSnapshot(snapshot);
