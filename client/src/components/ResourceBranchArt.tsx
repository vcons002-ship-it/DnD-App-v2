import { memo } from 'react';
import './resource-branch-art.css';

const BRANCH_ART = '/art/hud/resource-branch-v4.png';
const GUARDIAN_BRANCHES = {
  'half-orc-fighter': '/art/hud/resource-branch-fighter-v1.png',
  'half-elf-ranger': '/art/hud/resource-branch-ranger-v1.png',
  'tiefling-sorcerer': '/art/hud/resource-branch-sorcerer-v1.png',
} as const;
export type GuardianArt = keyof typeof GUARDIAN_BRANCHES;

/**
 * A decorative extension of the existing guardian filigree, not a stretched
 * copy. Fixed-size scrollwork caps frame three adjoining, alternating middle
 * sections. Mirroring the middle section makes its adjoining edges meet at
 * the same point in the source art, without a hard cut through the metal.
 */
export const ResourceBranchArt = memo(function ResourceBranchArt({ extended, guardian }: {
  extended: boolean;
  guardian?: GuardianArt | null;
}) {
  // Follow the orb's existing race/class selection. This is decorative only;
  // resource ordering, arc geometry, counters and hit targets stay unchanged.
  const art = guardian ? GUARDIAN_BRANCHES[guardian] : BRANCH_ART;
  if (!extended) return <img className="hud-branch-art" data-resource-art={guardian ?? 'generic'} src={art} alt="" draggable={false} />;

  return <div className="hud-branch-art resource-branch-extended" data-resource-art={guardian ?? 'generic'} aria-hidden="true">
    <svg className="resource-branch-cap resource-branch-cap-start" viewBox="0 0 780 683" preserveAspectRatio="none" focusable="false">
      <image href={art} width="2048" height="683" />
    </svg>
    <span className="resource-branch-inlay">
      {[false, true, false].map((mirrored, index) => <svg
        key={index}
        className={`resource-branch-middle${mirrored ? ' resource-branch-middle-mirrored' : ''}`}
        viewBox="780 0 570 683" preserveAspectRatio="none" focusable="false">
        <image href={art} width="2048" height="683" />
      </svg>)}
    </span>
    <svg className="resource-branch-cap resource-branch-cap-end" viewBox="1350 0 698 683" preserveAspectRatio="none" focusable="false">
      <image href={art} width="2048" height="683" />
    </svg>
  </div>;
});
