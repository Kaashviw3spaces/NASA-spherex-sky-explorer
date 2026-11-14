// Small, labeled SVG plot for teaching models. Axes/series labels never imply measured flux.
export default function SciencePlot({ series, minX = .75, maxX = 5, minY = 0, maxY = 1, xLabel = 'Wavelength (µm)', yLabel, description, gridStretch = 1, vector = null }) {
  const x = value => 52 + (value - minX) / (maxX - minX) * 490;
  const y = value => 210 - (value - minY) / (maxY - minY) * 175;
  return <figure className="science-plot"><svg viewBox="0 0 570 270" role="img" aria-label={description}>
    {[0, .5, 1].map(frac => <g key={frac}><path d={`M52 ${y(minY + frac * (maxY - minY))}H542`} stroke="#25364a" /><text x="44" y={y(minY + frac * (maxY - minY)) + 4} textAnchor="end">{(minY + frac * (maxY - minY)).toFixed(1)}</text></g>)}
    {[minX, (minX + maxX) / 2, maxX].map(value => <text key={value} x={x(value)} y="233" textAnchor="middle">{value.toFixed(2)}</text>)}
    {Array.from({length:20},(_,i)=>minX+i*.25*gridStretch).filter(value=>value<=maxX).map(value=><path key={value} d={`M${x(value)} 35V210`} stroke="#98cbd718" />)}
    {vector && <g aria-label={`Wavelength shift ${vector.delta.toFixed(2)} micrometers`}><path d={`M${x(vector.rest)} 65H${x(vector.observed)}`} stroke={vector.color} strokeWidth="1.5" /><path d={`M${x(vector.observed)-6} 61L${x(vector.observed)} 65L${x(vector.observed)-6} 69`} fill="none" stroke={vector.color} /><text x={(x(vector.rest)+x(vector.observed))/2} y="55" textAnchor="middle">Δλ = {vector.delta.toFixed(2)} µm</text></g>}
    {series.map(line => <polyline key={line.name} points={line.points.map(point => `${x(point[0])},${y(point[1])}`).join(' ')} fill="none" stroke={line.color} strokeWidth="2" strokeDasharray={line.dashed ? '5 5' : undefined} />)}
    <text x="52" y="19">{yLabel}</text><text x="297" y="260" textAnchor="middle">{xLabel}</text>
  </svg><figcaption>{series.map(line => <span key={line.name}><i style={{ background: line.color }} />{line.name}</span>)}</figcaption></figure>;
}
