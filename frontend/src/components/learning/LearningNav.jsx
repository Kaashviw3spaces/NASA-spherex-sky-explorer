import { NavLink } from 'react-router-dom';

const destinations = [
  ['/learn', 'Field guide'],
  ['/missions', 'Missions'],
  ['/experiments', 'Experiments'],
  ['/library', 'Journal']
];

export default function LearningNav() {
  return (
    <nav className="learning-nav learning-route-nav" aria-label="Learning experiences">
      {destinations.map(([to, label]) => (
        <NavLink key={to} to={to}>
          {({ isActive }) => <span className={isActive ? 'learning-route-active' : undefined}>{label}</span>}
        </NavLink>
      ))}
    </nav>
  );
}
