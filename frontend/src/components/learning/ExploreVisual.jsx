import { useId } from 'react';
import { SPHEREX_INVESTIGATION as evidence } from '../../data/investigation';

export default function ExploreVisual({ kind }) {
  const id = useId();
  if (kind === 'comparison') return <figure className="explore-teaching-visual">
    <div className="explore-image-pair">{['march','may'].map((month,index) => <div key={month}>
      <img src={`/images/learning/spherex-${month}.png`} loading="lazy" width="128" height="128" alt={`Real SPHEREx ${index ? 'May' : 'March'} exposure of the same reference field`} />
      <strong>{index ? 'B · 4 May 2026' : 'A · 19 March 2026'}</strong>
      <a href={evidence.inputs[index].url} target="_blank" rel="noreferrer">Source FITS ↗</a>
    </div>)}</div>
    <figcaption>Real SPHEREx pair · same sky region, angle, and contrast. Compare the positions of several dots—not just brightness. Zooming in won't add detail.</figcaption>
  </figure>;

  if (kind === 'foreground') return <figure className="explore-teaching-visual">
    <svg viewBox="0 0 680 250" role="img" aria-labelledby={id}>
      <title id={id}>Illustration of foreground dust scattering sunlight into a telescope’s line of sight</title>
      <rect width="680" height="250" fill="#07090e" rx="6" />
      <path d="M130 175 L365 85 L590 175" stroke="#d8b26e" strokeWidth="2" fill="none" strokeDasharray="6 6" />
      <path d="M70 55 L590 175" stroke="#8bb8d4" strokeWidth="2" fill="none" />
      <circle cx="130" cy="175" r="22" fill="#d8b26e" />
      <path d="M70 39v32M54 55h32" stroke="#b7d2e8" strokeWidth="2" />
      {[[320,78],[345,99],[363,77],[380,96],[397,68],[354,54],[409,90]].map(([x,y],i) => <circle key={i} cx={x} cy={y} r="3" fill="#d8b26e" opacity=".75" />)}
      <path d="M578 161l25 8-8 25-25-8z" fill="#172430" stroke="#b7d2e8" strokeWidth="2" />
      <g fill="#dce5ed" fontSize="14"><text x="36" y="27">Distant source</text><text x="105" y="222">Sun</text><text x="308" y="35">Solar System dust</text><text x="538" y="222">Telescope</text></g>
      <text x="187" y="150" fill="#d8b26e" fontSize="12">Scattered sunlight</text><text x="206" y="63" fill="#8bb8d4" fontSize="12">Source light</text>
    </svg>
    <figcaption>Not to scale: the telescope captures starlight through a shifting foreground haze (estimated by the ZODI layer), so the image can dim even if the star stays the same.</figcaption>
  </figure>;

  return <figure className="explore-teaching-visual">
    <svg viewBox="0 0 680 205" role="img" aria-labelledby={id}>
      <title id={id}>Three labels needed to identify an astronomical observation: position, date and wavelength</title>
      <rect width="680" height="205" rx="6" fill="#07090e" />
      {[
        ['01 / WHERE','Sky coordinates','RA 269.4521°','Dec +4.6934°'],
        ['02 / WHEN','Exposure date','19 March 2026','Image A'],
        ['03 / WHICH LIGHT','Local wavelength',`${evidence.inputs[0].center_wavelength_um.toFixed(3)} µm`,'At field centre']
      ].map(([label,title,value,note],i) => <g key={label} transform={`translate(${24+i*226},30)`}>
        {i>0 && <path d="M-16 0v140" stroke="#34404d" />}
        <text fill="#d8b26e" fontSize="11" y="5">{label}</text>
        <text fill="#dce5ed" fontSize="17" y="44">{title}</text>
        <text fill="#b7d2e8" fontSize="15" y="83">{value}</text>
        <text fill="#a7b5c6" fontSize="13" y="111">{note}</text>
      </g>)}
    </svg>
    <figcaption>Observation A’s recorded labels. The local wavelength is not the detector’s full range; it changes across the image. Keep these labels with your notes.</figcaption>
  </figure>;
}
