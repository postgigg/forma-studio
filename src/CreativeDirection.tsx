export interface CreativeDirection {
  researchStatus: 'live' | 'reference-library' | 'unavailable';
  researchedAt: string;
  sources: { url: string; title: string; creator: string; basis: 'visual' | 'description'; origin?: 'live' | 'reference-library'; observation: string; transferablePrinciple: string; doNotCopy: string }[];
  routes: { name: string; concept: string; brandConnection: string; composition: string; typography: string; colorLogic: string; originalTwist: string }[];
  selectedRoute: number;
  selectionReason: string;
}
export interface QualityReview {
  status: 'reviewed' | 'needs-attention' | 'unavailable';
  summary: string;
  strengths: string[];
  issues: { page: number; element: string; problem: string; fix: string; priority: 'critical' | 'craft' }[];
  revisions: number;
}
export function DesignEvidence({ direction, review }: { direction?: CreativeDirection; review?: QualityReview }) {
  if (!direction && !review) return null;
  const chosen = direction?.routes[direction.selectedRoute];
  return <details className="ai-design-evidence">
    <summary>Design direction & review</summary>
    {chosen && <><h4>{chosen.name}</h4><p>{chosen.concept}</p><p>{chosen.brandConnection}</p><p><strong>Original twist:</strong> {chosen.originalTwist}</p></>}
    {review && <div className={`ai-review-note ${review.status}`}><strong>{review.status === 'reviewed' ? 'Rendered composition reviewed' : review.status === 'needs-attention' ? 'Review these details' : 'Visual review unavailable'}</strong><p>{review.summary}</p>{review.issues.slice(0, 4).map((issue, index) => <p key={index}>Page {issue.page} · {issue.element}: {issue.problem} {issue.fix}</p>)}</div>}
    {direction?.researchStatus === 'unavailable' && <p>Live reference research was unavailable. The design follows your brief, brand and style preferences.</p>}
    {direction?.researchStatus === 'reference-library' && <p>Live lookup was unavailable. Credited visual studies informed this direction.</p>}
    {direction && direction.sources.length > 0 && <><h4>Reference study</h4>{direction.sources.filter(source => /^https:\/\/dribbble\.com\/shots\/\d+-[a-z\d-]+$/i.test(source.url)).map(source => <div className="ai-reference-study" key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a><small>By {source.creator} · {source.basis === 'visual' ? 'Image studied' : 'Description studied'}</small><p>{source.observation}</p><p>{source.transferablePrinciple}</p></div>)}</>}
  </details>;
}
