// Bilinear lookup on the same common sky grid used to enlarge the display image.
export function wavelengthAtPixel(frame, x, y, size = 512) {
  const grid = frame?.spectral;
  if (!grid?.length || !grid[0]?.length) return undefined;
  const sx = x*(grid[0].length-1)/(size-1), sy = y*(grid.length-1)/(size-1);
  const x0=Math.floor(sx),y0=Math.floor(sy),x1=Math.min(x0+1,grid[0].length-1),y1=Math.min(y0+1,grid.length-1);
  const values=[grid[y0][x0]?.[0],grid[y0][x1]?.[0],grid[y1][x0]?.[0],grid[y1][x1]?.[0]];
  if (!values.every(Number.isFinite)) return undefined;
  const dx=sx-x0,dy=sy-y0;
  return values[0]*(1-dx)*(1-dy)+values[1]*dx*(1-dy)+values[2]*(1-dx)*dy+values[3]*dx*dy;
}
