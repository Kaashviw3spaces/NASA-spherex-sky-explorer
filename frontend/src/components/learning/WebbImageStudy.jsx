import { useId, useState } from 'react';

const source = 'https://science.nasa.gov/asset/webb/cosmic-cliffs-in-the-carina-nebula-nircam-image/';
const views = [
  { name: 'Whole image', scale: 1, origin: '50% 50%', text: 'NGC 3324, a star-forming region in Carina. This is a processed Webb NIRCam image, not a SPHEREx observation.' },
  { name: 'Cloud edge', scale: 1.8, origin: '50% 75%', text: 'The ridge is the edge of a gaseous cavity. Zoom changes the crop, not the telescope’s resolution.' },
  { name: 'Stars & colors', scale: 1.8, origin: '65% 15%', text: 'Visible colors represent infrared filters. The image contains stars and background galaxies; this viewer does not classify individual sources.' }
];

export default function WebbImageStudy() {
  const [selected, setSelected] = useState(0);
  const [failed, setFailed] = useState(false);
  const id = useId();
  const view = views[selected];

  return (
    <figure className="webb-image-study" aria-label="Examine a real Webb image">
      <div className="image-study-heading"><span>IMAGE 01 / NGC 3324</span><span>WEBB · NIRCam</span></div>
      <div className="image-study-viewport">
        {failed ? <p role="status">Image unavailable. <a href={source} target="_blank" rel="noreferrer">View the NASA source ↗</a></p> : (
          <img src="/images/carina-webb.jpg" alt="Bright points above the amber cloud edge in Webb’s infrared image of NGC 3324" width="1800" height="1042" onError={() => setFailed(true)} style={{ transform: `scale(${view.scale})`, transformOrigin: view.origin }} />
        )}
      </div>
      <div className="image-study-controls" role="group" aria-label="Choose an image detail">
        {views.map((item, index) => <button key={item.name} type="button" aria-pressed={selected === index} aria-controls={id} onClick={() => setSelected(index)}>{item.name}</button>)}
      </div>
      <figcaption>
        <p id={id} aria-live="polite">{view.text}</p>
        <a href={source} target="_blank" rel="noreferrer">NASA, ESA, CSA, STScI · Image &amp; filter details ↗</a>
        <small>Assigned infrared colors · image crop, no added objects</small>
      </figcaption>
    </figure>
  );
}
