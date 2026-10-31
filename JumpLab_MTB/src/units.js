/**
 * Jump Lab — Unit system
 * Physics is always SI. These helpers convert at the UI boundary only.
 */

export const MPH_TO_MS = 0.44704; // exact
export const KMH_TO_MS = 1 / 3.6;
export const FT_TO_M = 0.3048; // exact

export const UNIT_SYSTEMS = Object.freeze({
  imperial: { speed: 'mph', length: 'ft', g: 'ft/s²', velocity: 'ft/s' },
  metric: { speed: 'km/h', length: 'm', g: 'm/s²', velocity: 'm/s' },
});

export const mphToMs = (v) => v * MPH_TO_MS;
export const msToMph = (v) => v / MPH_TO_MS;
export const kmhToMs = (v) => v * KMH_TO_MS;
export const msToKmh = (v) => v / KMH_TO_MS;
export const ftToM = (d) => d * FT_TO_M;
export const mToFt = (d) => d / FT_TO_M;

/** Display speed (mph or km/h) → m/s */
export function speedToSI(v, system) {
  return system === 'metric' ? kmhToMs(v) : mphToMs(v);
}
export function speedFromSI(v, system) {
  return system === 'metric' ? msToKmh(v) : msToMph(v);
}
/** Display length (ft or m) → m */
export function lengthToSI(d, system) {
  return system === 'metric' ? d : ftToM(d);
}
export function lengthFromSI(d, system) {
  return system === 'metric' ? d : mToFt(d);
}
/** Velocity (m/s) → ft/s or m/s — used in the workbench where equations need consistent units */
export function velocityFromSI(v, system) {
  return system === 'metric' ? v : mToFt(v);
}
export function gFromSI(g, system) {
  return system === 'metric' ? g : mToFt(g);
}
