import { useId } from 'react';
import { WEBB_IMAGES } from '../../data/webbImages';

export default function EditorialCover({ image = 'carina', eyebrow, title, children }) {
  const id = useId();
  const photo = WEBB_IMAGES[image];
  return (
    <section className={`editorial-cover cover-${image}`} aria-labelledby={id}>
      <div className="cover-landscape">
        <img src={photo.src} alt={photo.alt} width="1400" height="850" />
        <div className="cover-content"><div className="eyebrow">{eyebrow}</div><h1 id={id}>{title}</h1><p>{children}</p></div>
        <span className="cover-plate" aria-hidden="true">FIELD NOTES<br />{photo.instrument.toUpperCase()}</span>
      </div>
      <p className="cover-credit"><a href={photo.source} target="_blank" rel="noreferrer">{photo.title} · {photo.instrument} ↗</a><span>Assigned infrared colors · editorial image, not app measurements<br />{photo.credit}</span></p>
    </section>
  );
}
