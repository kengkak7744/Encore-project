import { artistImageEvidence } from './artist-image-evidence.js';
import { artistImageEvidenceSupplement } from './artist-image-evidence-supplement.js';
import { artistImageEvidenceFinal } from './artist-image-evidence-final.js';
import { artistPopularityEvidence } from './artist-popularity-evidence.js';
import { artistPopularityEvidenceSupplement } from './artist-popularity-evidence-supplement.js';
import { expandedArtistPopularityEvidence } from './expanded-artist-popularity.js';

// Supplements replace observations for the same identity, never add duplicates.
export const reviewedArtistImages = [...new Map([...artistImageEvidence, ...artistImageEvidenceSupplement, ...artistImageEvidenceFinal].map(row => [row.slug, row])).values()];
export const reviewedArtistPopularity = [...new Map([...artistPopularityEvidence.rows, ...artistPopularityEvidenceSupplement.rows, ...expandedArtistPopularityEvidence.rows].map(row => [row.slug, row])).values()];
