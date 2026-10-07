// License and identity review: 4 October 2026. Pending records must not be displayed as cleared images.
type ReviewedImage = {
  slug: string;
  status: 'verified-license';
  imageUrl: string;
  sourceUrl: string;
  creator: string;
  license: string;
  licenseUrl: string;
  verifiedAt: string;
  identityEvidence: string;
  photoDate: string;
  credit: string;
  attributionRequired: boolean;
  changes: string;
  notes: string;
  fileTitle: string;
  originalSourceUrls: string[];
  licenseReviewPending: boolean;
  permissionEvidence: string;
  caption?: string;
  imageKind?: 'group-context';
  urlCheck: { checkedAt: string; status: number; contentType: string; error?: string };
};
type PendingImage = { slug: string; status: 'unverified'; reason: string; verifiedAt: string };
export type ArtistImageEvidenceSupplementRow = ReviewedImage | PendingImage;
export const artistImageEvidenceSupplement: ArtistImageEvidenceSupplementRow[] = [
  {
    "slug": "cocktail",
    "status": "verified-license",
    "imageUrl": "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/ff/Cocktail_at_Terminal21.jpg/960px-Cocktail_at_Terminal21.jpg",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File%3ACocktail_at_Terminal21.jpg",
    "creator": "Sry85",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "verifiedAt": "2026-10-04T07:45:38.367Z",
    "identityEvidence": "Cocktail at Terminal 21",
    "photoDate": "2019-09-27 09:20:40",
    "credit": "Own work",
    "attributionRequired": true,
    "changes": "Display Commons supplied version without additional cropping or editing; retain source, creator, license and prior-change information.",
    "notes": "Historical photo for an informational artist profile; not evidence of current membership, label affiliation or endorsement.",
    "fileTitle": "File:Cocktail at Terminal21.jpg",
    "originalSourceUrls": [],
    "licenseReviewPending": false,
    "permissionEvidence": "Commons uploader declares own work and grants the listed Creative Commons license; photo identity agrees with title/description.",
    "urlCheck": {
      "checkedAt": "2026-10-04T07:45:38.977Z",
      "status": 200,
      "contentType": "image/jpeg"
    }
  },
  {
    "slug": "slot-machine",
    "status": "verified-license",
    "imageUrl": "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a9/Slot_Machine_at_TU_TPC_2026.jpg/960px-Slot_Machine_at_TU_TPC_2026.jpg",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File%3ASlot_Machine_at_TU_TPC_2026.jpg",
    "creator": "KrebsLovesFiesh",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "verifiedAt": "2026-10-04T07:45:38.367Z",
    "identityEvidence": "Slot Machine performing at Thammasat University Tha Prachan in 2026",
    "photoDate": "2026-03-26 21:36:09",
    "credit": "Own work",
    "attributionRequired": true,
    "changes": "Display Commons supplied version without additional cropping or editing; retain source, creator, license and prior-change information.",
    "notes": "Historical photo for an informational artist profile; not evidence of current membership, label affiliation or endorsement.",
    "fileTitle": "File:Slot Machine at TU TPC 2026.jpg",
    "originalSourceUrls": [],
    "licenseReviewPending": false,
    "permissionEvidence": "Commons uploader declares own work and grants the listed Creative Commons license; photo identity agrees with title/description.",
    "urlCheck": {
      "checkedAt": "2026-10-04T07:45:39.579Z",
      "status": 200,
      "contentType": "image/jpeg"
    }
  },
  {
    "slug": "getsunova",
    "status": "verified-license",
    "imageUrl": "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/02/Getsunova_performing_at_VERY_TV.jpeg/960px-Getsunova_performing_at_VERY_TV.jpeg",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File%3AGetsunova_performing_at_VERY_TV.jpeg",
    "creator": "User:sry85",
    "license": "CC BY-SA 3.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/3.0",
    "verifiedAt": "2026-10-04T07:45:38.367Z",
    "identityEvidence": "Getsunova performing at VERY TV.",
    "photoDate": "25 June 2013 (according to Exif data)",
    "credit": "Own work",
    "attributionRequired": true,
    "changes": "Display Commons supplied version without additional cropping or editing; retain source, creator, license and prior-change information.",
    "notes": "Historical photo for an informational artist profile; not evidence of current membership, label affiliation or endorsement.",
    "fileTitle": "File:Getsunova performing at VERY TV.jpeg",
    "originalSourceUrls": [],
    "licenseReviewPending": false,
    "permissionEvidence": "Commons uploader declares own work and grants the listed Creative Commons license; photo identity agrees with title/description.",
    "urlCheck": {
      "checkedAt": "2026-10-04T07:45:40.360Z",
      "status": 200,
      "contentType": "image/jpeg"
    }
  },
  {
    "slug": "polycat",
    "status": "verified-license",
    "imageUrl": "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/08/Polycat_concert_at_King_Mongkut%27s_University_of_Technology_Thonburi.jpg/960px-Polycat_concert_at_King_Mongkut%27s_University_of_Technology_Thonburi.jpg",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File%3APolycat_concert_at_King_Mongkut's_University_of_Technology_Thonburi.jpg",
    "creator": "KaiserO5",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "verifiedAt": "2026-10-04T07:45:38.367Z",
    "identityEvidence": "Commons file title identifies Polycat performing at King Mongkut’s University of Technology Thonburi; description identifies Smallroom Music Camp Tour 2025. Full historical performance image, not a current roster photo.",
    "photoDate": "2025-09-15 19:17:12",
    "credit": "Own work",
    "attributionRequired": true,
    "changes": "Display Commons supplied version without additional cropping or editing; retain source, creator, license and prior-change information.",
    "notes": "Historical photo for an informational artist profile; not evidence of current membership, label affiliation or endorsement.",
    "fileTitle": "File:Polycat concert at King Mongkut's University of Technology Thonburi.jpg",
    "originalSourceUrls": [],
    "licenseReviewPending": false,
    "permissionEvidence": "Commons uploader declares own work and grants the listed Creative Commons license; photo identity agrees with title/description.",
    "urlCheck": {
      "checkedAt": "2026-10-04T07:45:41.518Z",
      "status": 200,
      "contentType": "image/jpeg"
    }
  },
  {
    "slug": "proxie",
    "status": "verified-license",
    "imageUrl": "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/31/PROXIE_in_2025.jpg/960px-PROXIE_in_2025.jpg",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File%3APROXIE_in_2025.jpg",
    "creator": "Mygeneyati",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0",
    "verifiedAt": "2026-10-04T07:45:38.367Z",
    "identityEvidence": "Photo of PROXIE members.",
    "photoDate": "2025-09-25 18:58:22",
    "credit": "Own work",
    "attributionRequired": true,
    "changes": "Display Commons supplied version without additional cropping or editing; retain source, creator, license and prior-change information.",
    "notes": "Historical photo for an informational artist profile; not evidence of current membership, label affiliation or endorsement.",
    "fileTitle": "File:PROXIE in 2025.jpg",
    "originalSourceUrls": [],
    "licenseReviewPending": false,
    "permissionEvidence": "Commons uploader declares own work and grants the listed Creative Commons license; photo identity agrees with title/description.",
    "urlCheck": {
      "checkedAt": "2026-10-04T07:45:42.143Z",
      "status": 200,
      "contentType": "image/jpeg"
    }
  },
  {
    "slug": "pixxie",
    "status": "verified-license",
    "imageUrl": "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/12/PiXXiE_in_November_2023.png/960px-PiXXiE_in_November_2023.png",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File%3APiXXiE_in_November_2023.png",
    "creator": "THHeadline",
    "license": "CC BY 3.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/3.0",
    "verifiedAt": "2026-10-04T07:45:38.367Z",
    "identityEvidence": "Captured picture of PiXXiE from Youtube \"THHeadline X PiXXiE | Exclusive Interview\"",
    "photoDate": "2023-11-10",
    "credit": "YouTube: https://www.youtube.com/watch?v=EwFS55gtNJQ&list=LL&index=1&t=1s – View/save archived versions on archive.org",
    "attributionRequired": true,
    "changes": "Display Commons supplied version without additional cropping or editing; retain source, creator, license and prior-change information.",
    "notes": "Historical photo for an informational artist profile; not evidence of current membership, label affiliation or endorsement.",
    "fileTitle": "File:PiXXiE in November 2023.png",
    "originalSourceUrls": [
      "https://www.youtube.com/watch?v=EwFS55gtNJQ&list=LL&index=1&t=1s",
      "https://www.youtube.com/watch?v=EwFS55gtNJQ",
      "https://web.archive.org/web/*/https://www.youtube.com/watch?v=EwFS55gtNJQ"
    ],
    "licenseReviewPending": false,
    "permissionEvidence": "Commons YouTubeReview: ChoHyeri reviewed the original video license on 12 May 2024.",
    "urlCheck": {
      "checkedAt": "2026-10-04T07:45:42.507Z",
      "status": 200,
      "contentType": "image/png"
    }
  },
  {
    "slug": "ink-waruntorn",
    "status": "verified-license",
    "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/0/0d/Ink_Waruntorn_at_VERY_TV.jpg",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File%3AInk_Waruntorn_at_VERY_TV.jpg",
    "creator": "Sry85",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "verifiedAt": "2026-10-04T07:45:38.367Z",
    "identityEvidence": "Ink Waruntorn at VERY TV.",
    "photoDate": "2015-12-15 12:04:49",
    "credit": "Own work",
    "attributionRequired": true,
    "changes": "Display Commons supplied version without additional cropping or editing; retain source, creator, license and prior-change information.",
    "notes": "Historical photo for an informational artist profile; not evidence of current membership, label affiliation or endorsement.",
    "fileTitle": "File:Ink Waruntorn at VERY TV.jpg",
    "originalSourceUrls": [],
    "licenseReviewPending": false,
    "permissionEvidence": "Commons uploader declares own work and grants the listed Creative Commons license; photo identity agrees with title/description.",
    "urlCheck": {
      "checkedAt": "2026-10-04T07:45:42.873Z",
      "status": 200,
      "contentType": "image/jpeg"
    }
  },
  {
    "slug": "the-toys",
    "status": "verified-license",
    "imageUrl": "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3b/%E0%B8%97%E0%B8%AD%E0%B8%A2_%E0%B8%98%E0%B8%B1%E0%B8%99%E0%B8%A7%E0%B8%B2_%E0%B8%9A%E0%B8%B8%E0%B8%8D%E0%B8%AA%E0%B8%B9%E0%B8%87%E0%B9%80%E0%B8%99%E0%B8%B4%E0%B8%99.png/960px-%E0%B8%97%E0%B8%AD%E0%B8%A2_%E0%B8%98%E0%B8%B1%E0%B8%99%E0%B8%A7%E0%B8%B2_%E0%B8%9A%E0%B8%B8%E0%B8%8D%E0%B8%AA%E0%B8%B9%E0%B8%87%E0%B9%80%E0%B8%99%E0%B8%B4%E0%B8%99.png",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File%3A%E0%B8%97%E0%B8%AD%E0%B8%A2_%E0%B8%98%E0%B8%B1%E0%B8%99%E0%B8%A7%E0%B8%B2_%E0%B8%9A%E0%B8%B8%E0%B8%8D%E0%B8%AA%E0%B8%B9%E0%B8%87%E0%B9%80%E0%B8%99%E0%B8%B4%E0%B8%99.png",
    "creator": "CLEO Thailand",
    "license": "CC BY 3.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/3.0",
    "verifiedAt": "2026-10-04T07:45:38.367Z",
    "identityEvidence": "ทอย ธันวา บุญสูงเนิน",
    "photoDate": "2019-02-23",
    "credit": "YouTube (Time: 16s) – View/save archived versions on archive.org",
    "attributionRequired": true,
    "changes": "Display Commons supplied version without additional cropping or editing; retain source, creator, license and prior-change information.",
    "notes": "Historical photo for an informational artist profile; not evidence of current membership, label affiliation or endorsement.",
    "fileTitle": "File:ทอย ธันวา บุญสูงเนิน.png",
    "originalSourceUrls": [
      "https://www.youtube.com/watch?v=GQGGYSOZen0&t=16s",
      "https://web.archive.org/web/*/https://www.youtube.com/watch?v=GQGGYSOZen0"
    ],
    "licenseReviewPending": false,
    "permissionEvidence": "Commons YouTubeReview: Baji reviewed the original video license on 6 December 2023.",
    "urlCheck": {
      "checkedAt": "2026-10-04T07:45:43.462Z",
      "status": 200,
      "contentType": "image/png"
    }
  },
  {
    "slug": "palmy",
    "status": "verified-license",
    "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/e/ef/Palmy.jpg",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File%3APalmy.jpg",
    "creator": "Sry85",
    "license": "CC BY 3.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/3.0",
    "verifiedAt": "2026-10-04T07:45:38.367Z",
    "identityEvidence": "Palmy at MTV Thailand",
    "photoDate": "Not stated on Commons file description",
    "credit": "Own work",
    "attributionRequired": true,
    "changes": "Commons version cropped and levels adjusted by Materialscientist on 19 March 2012; original photographer Sry85. Encore makes no further edits. CC BY 3.0 selected from offered dual GFDL/CC BY licensing.",
    "notes": "Historical photo for an informational artist profile; not evidence of current membership, label affiliation or endorsement.",
    "fileTitle": "File:Palmy.jpg",
    "originalSourceUrls": [],
    "licenseReviewPending": false,
    "permissionEvidence": "Commons uploader declares own work and grants the listed Creative Commons license; photo identity agrees with title/description.",
    "urlCheck": {
      "checkedAt": "2026-10-04T07:45:43.823Z",
      "status": 200,
      "contentType": "image/jpeg"
    }
  },
  {
    "slug": "stamp-apiwat",
    "status": "verified-license",
    "imageUrl": "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/74/20171017_StampApiwat_MoonRomanticLive.jpg/960px-20171017_StampApiwat_MoonRomanticLive.jpg",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File%3A20171017_StampApiwat_MoonRomanticLive.jpg",
    "creator": "Akiko718atWiki",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "verifiedAt": "2026-10-04T07:45:38.367Z",
    "identityEvidence": "タイのシンガーソングライター、スタンプ・アピワットの来日ライブの写真です。\n2017年10月17日 青山 月見ル君想フ ライブにて。",
    "photoDate": "2017-10-17 22:58:06",
    "credit": "Own work",
    "attributionRequired": true,
    "changes": "Display Commons supplied version without additional cropping or editing; retain source, creator, license and prior-change information.",
    "notes": "Historical photo for an informational artist profile; not evidence of current membership, label affiliation or endorsement.",
    "fileTitle": "File:20171017 StampApiwat MoonRomanticLive.jpg",
    "originalSourceUrls": [],
    "licenseReviewPending": false,
    "permissionEvidence": "Commons uploader declares own work and grants the listed Creative Commons license; photo identity agrees with title/description.",
    "urlCheck": {
      "checkedAt": "2026-10-04T07:45:44.415Z",
      "status": 200,
      "contentType": "image/jpeg"
    }
  },
  {
    "slug": "scrubb",
    "status": "verified-license",
    "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/3/35/Scrubb.jpg",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File%3AScrubb.jpg",
    "creator": "Sry85",
    "license": "CC BY 3.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/3.0",
    "verifiedAt": "2026-10-04T07:45:38.367Z",
    "identityEvidence": "Scrubb at MTV Fast Forward",
    "photoDate": "2008-10-08",
    "credit": "Own work",
    "attributionRequired": true,
    "changes": "Display Commons supplied version without additional cropping or editing; retain source, creator, license and prior-change information.",
    "notes": "Historical photo for an informational artist profile; not evidence of current membership, label affiliation or endorsement.",
    "fileTitle": "File:Scrubb.jpg",
    "originalSourceUrls": [],
    "licenseReviewPending": false,
    "permissionEvidence": "Commons uploader declares own work and grants the listed Creative Commons license; photo identity agrees with title/description.",
    "urlCheck": {
      "checkedAt": "2026-10-04T07:45:45.015Z",
      "status": 200,
      "contentType": "image/jpeg"
    }
  },
  {
    "slug": "musketeers",
    "status": "verified-license",
    "imageUrl": "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/58/Musketeers_at_VERY_TV.JPG/960px-Musketeers_at_VERY_TV.JPG",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File%3AMusketeers_at_VERY_TV.JPG",
    "creator": "Sry85",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0",
    "verifiedAt": "2026-10-04T07:45:38.367Z",
    "identityEvidence": "Musketeers at VERY TV.",
    "photoDate": "2014-12-11 15:04:36",
    "credit": "Own work",
    "attributionRequired": true,
    "changes": "Display Commons supplied version without additional cropping or editing; retain source, creator, license and prior-change information.",
    "notes": "Historical photo for an informational artist profile; not evidence of current membership, label affiliation or endorsement.",
    "fileTitle": "File:Musketeers at VERY TV.JPG",
    "originalSourceUrls": [],
    "licenseReviewPending": false,
    "permissionEvidence": "Commons uploader declares own work and grants the listed Creative Commons license; photo identity agrees with title/description.",
    "urlCheck": {
      "checkedAt": "2026-10-04T07:45:45.818Z",
      "status": 200,
      "contentType": "image/jpeg"
    }
  },
  {
    "slug": "hannah-4eve",
    "status": "verified-license",
    "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/0/09/Hannah_Rosenbloom_%40The_Guitar_MAG_Awards_2023.jpg",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File%3AHannah_Rosenbloom_%40The_Guitar_MAG_Awards_2023.jpg",
    "creator": "THHeadline",
    "license": "CC BY 3.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/3.0",
    "verifiedAt": "2026-10-04T07:45:38.367Z",
    "identityEvidence": "Hannah Rosenbloom at the Guitar MAG Awards 2023.",
    "photoDate": "2023-05-09",
    "credit": "YouTube (Time: 4) – View/save archived versions on archive.org",
    "attributionRequired": true,
    "changes": "Commons CropTool extraction by ChoHyeri on 10 August 2025: 80% horizontal and 23% vertical crop from the credited parent; no additional changes by Encore.",
    "notes": "Historical photo for an informational artist profile; not evidence of current membership, label affiliation or endorsement.",
    "fileTitle": "File:Hannah Rosenbloom @The Guitar MAG Awards 2023.jpg",
    "originalSourceUrls": [
      "https://www.youtube.com/watch?v=FArEbiO5a_o&t=4",
      "https://web.archive.org/web/*/https://www.youtube.com/watch?v=FArEbiO5a_o",
      "https://commons.wikimedia.org/wiki/File:4EVE_%40The_Guitar_MAG_Awards_2023.jpg"
    ],
    "licenseReviewPending": false,
    "permissionEvidence": "The child file explicitly derives from 4EVE @The Guitar MAG Awards 2023.jpg; the parent records positive LicenseReview by ChoHyeri on 10 August 2025 for the same THHeadline video FArEbiO5a_o.",
    "urlCheck": {
      "checkedAt": "2026-10-04T07:45:46.448Z",
      "status": 200,
      "contentType": "image/jpeg"
    }
  },
  {
    "slug": "potato",
    "status": "verified-license",
    "imageUrl": "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/11/Potato_%28band%29.jpg/960px-Potato_%28band%29.jpg",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File%3APotato_(band).jpg",
    "creator": "Sry85",
    "license": "CC BY 3.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/3.0",
    "verifiedAt": "2026-10-04T07:45:38.367Z",
    "identityEvidence": "Potato at backstage of MTV Exit Live in Bangkok.",
    "photoDate": "2008-12-14",
    "credit": "Own work",
    "attributionRequired": true,
    "changes": "Display Commons supplied version without additional cropping or editing; retain source, creator, license and prior-change information.",
    "notes": "Historical photo for an informational artist profile; not evidence of current membership, label affiliation or endorsement.",
    "fileTitle": "File:Potato (band).jpg",
    "originalSourceUrls": [],
    "licenseReviewPending": false,
    "permissionEvidence": "Commons uploader declares own work and grants the listed Creative Commons license; photo identity agrees with title/description.",
    "urlCheck": {
      "checkedAt": "2026-10-04T07:45:47.278Z",
      "status": 200,
      "contentType": "image/jpeg"
    }
  },
  {
    "slug": "d-gerrard",
    "status": "verified-license",
    "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/2/26/D_Gerrard_2020.png",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File%3AD_Gerrard_2020.png",
    "creator": "Talyn.l",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "verifiedAt": "2026-10-04T07:45:38.367Z",
    "identityEvidence": "D Gerrard",
    "photoDate": "2020-05-15",
    "credit": "Own work",
    "attributionRequired": true,
    "changes": "Display Commons supplied version without additional cropping or editing; retain source, creator, license and prior-change information.",
    "notes": "Historical photo for an informational artist profile; not evidence of current membership, label affiliation or endorsement.",
    "fileTitle": "File:D Gerrard 2020.png",
    "originalSourceUrls": [],
    "licenseReviewPending": false,
    "permissionEvidence": "Commons uploader declares own work and grants the listed Creative Commons license; photo identity agrees with title/description.",
    "urlCheck": {
      "checkedAt": "2026-10-04T07:45:47.645Z",
      "status": 429,
      "contentType": "text/html; charset=utf-8"
    }
  },
  {
    "slug": "f-hero",
    "status": "verified-license",
    "imageUrl": "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/85/Golf_at_Joox_Music_Awards_2017.jpg/960px-Golf_at_Joox_Music_Awards_2017.jpg",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File%3AGolf_at_Joox_Music_Awards_2017.jpg",
    "creator": "Sry85",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "verifiedAt": "2026-10-04T07:45:38.367Z",
    "identityEvidence": "Commons description identifies Golf at Joox Music Awards 2017, and the file is in the F.Hero category.",
    "photoDate": "2017-03-23 19:29:00",
    "credit": "Own work",
    "attributionRequired": true,
    "changes": "Display Commons supplied version without additional cropping or editing; retain source, creator, license and prior-change information.",
    "notes": "Historical photo for an informational artist profile; not evidence of current membership, label affiliation or endorsement.",
    "fileTitle": "File:Golf at Joox Music Awards 2017.jpg",
    "originalSourceUrls": [],
    "licenseReviewPending": false,
    "permissionEvidence": "Commons uploader declares own work and grants the listed Creative Commons license; photo identity agrees with title/description.",
    "urlCheck": {
      "checkedAt": "2026-10-04T07:45:48.225Z",
      "status": 200,
      "contentType": "image/jpeg"
    }
  },
  {
    "slug": "joey-boy",
    "status": "verified-license",
    "imageUrl": "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0e/Joey_Boy_in_2019_%281%29.jpg/960px-Joey_Boy_in_2019_%281%29.jpg",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File%3AJoey_Boy_in_2019_(1).jpg",
    "creator": "กสิณธร ราชโอรส",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "verifiedAt": "2026-10-04T07:45:38.367Z",
    "identityEvidence": "Joey Boy แสดงในงานฮึบ ๆ ไทยแลนด์ ที่ลานหน้าหอศิลปวัฒนธรรมแห่งกรุงเทพมหานคร วันที่ 3 ธันวาคม  2562",
    "photoDate": "2019-12-03 16:51:40",
    "credit": "Own work",
    "attributionRequired": true,
    "changes": "Display Commons supplied version without additional cropping or editing; retain source, creator, license and prior-change information.",
    "notes": "Historical photo for an informational artist profile; not evidence of current membership, label affiliation or endorsement.",
    "fileTitle": "File:Joey Boy in 2019 (1).jpg",
    "originalSourceUrls": [],
    "licenseReviewPending": false,
    "permissionEvidence": "Commons uploader declares own work and grants the listed Creative Commons license; photo identity agrees with title/description.",
    "urlCheck": {
      "checkedAt": "2026-10-04T07:45:49.015Z",
      "status": 200,
      "contentType": "image/jpeg"
    }
  },
  {
    "slug": "daou-pittaya",
    "status": "verified-license",
    "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/c/cb/Daou_Pittaya_2024-02-07.jpg",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File%3ADaou_Pittaya_2024-02-07.jpg",
    "creator": "THHeadline",
    "license": "CC BY 3.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/3.0",
    "verifiedAt": "2026-10-04T07:45:38.367Z",
    "identityEvidence": "Daou Pittaya interview",
    "photoDate": "2024-02-07",
    "credit": "YouTube – View/save archived versions on archive.org",
    "attributionRequired": true,
    "changes": "Display Commons supplied version without additional cropping or editing; retain source, creator, license and prior-change information.",
    "notes": "Historical photo for an informational artist profile; not evidence of current membership, label affiliation or endorsement.",
    "fileTitle": "File:Daou Pittaya 2024-02-07.jpg",
    "originalSourceUrls": [
      "https://www.youtube.com/watch?v=nz4GPIPTHT8",
      "https://web.archive.org/web/*/https://www.youtube.com/watch?v=nz4GPIPTHT8"
    ],
    "licenseReviewPending": false,
    "permissionEvidence": "Commons LicenseReview: ChoHyeri reviewed THHeadline video nz4GPIPTHT8 on 22 June 2025.",
    "urlCheck": {
      "checkedAt": "2026-10-04T07:45:49.385Z",
      "status": 200,
      "contentType": "image/jpeg"
    }
  },
  {
    "slug": "offroad-kantapon",
    "status": "verified-license",
    "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/1/12/Offroad_Kantapon_2024-02-07.jpg",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File%3AOffroad_Kantapon_2024-02-07.jpg",
    "creator": "THHeadline",
    "license": "CC BY 3.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/3.0",
    "verifiedAt": "2026-10-04T07:45:38.367Z",
    "identityEvidence": "Offroad Kantapon interview",
    "photoDate": "2024-02-07",
    "credit": "YouTube – View/save archived versions on archive.org",
    "attributionRequired": true,
    "changes": "Display Commons supplied version without additional cropping or editing; retain source, creator, license and prior-change information.",
    "notes": "Historical photo for an informational artist profile; not evidence of current membership, label affiliation or endorsement.",
    "fileTitle": "File:Offroad Kantapon 2024-02-07.jpg",
    "originalSourceUrls": [
      "https://www.youtube.com/watch?v=nz4GPIPTHT8",
      "https://web.archive.org/web/*/https://www.youtube.com/watch?v=nz4GPIPTHT8",
      "https://commons.wikimedia.org/wiki/File:Daou_Pittaya_2024-02-07.jpg"
    ],
    "licenseReviewPending": false,
    "permissionEvidence": "The image comes from the exact same THHeadline video nz4GPIPTHT8 as File:Daou Pittaya 2024-02-07.jpg, which records positive LicenseReview by ChoHyeri on 22 June 2025.",
    "urlCheck": {
      "checkedAt": "2026-10-04T07:45:49.744Z",
      "status": 429,
      "contentType": "text/html; charset=utf-8"
    }
  },
  {
    "slug": "nene",
    "status": "verified-license",
    "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/7/74/Nene%E9%83%91%E4%B9%83%E9%A6%A8.jpg",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File%3ANene%E9%83%91%E4%B9%83%E9%A6%A8.jpg",
    "creator": "Ly Hai Production",
    "license": "CC BY 3.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/3.0",
    "verifiedAt": "2026-10-04T07:45:38.367Z",
    "identityEvidence": "​泰国女艺人郑乃馨",
    "photoDate": "2018-04-14",
    "credit": "https://www.youtube.com/watch?v=tLaQivEs6-Y",
    "attributionRequired": true,
    "changes": "Display Commons supplied version without additional cropping or editing; retain source, creator, license and prior-change information.",
    "notes": "Historical photo for an informational artist profile; not evidence of current membership, label affiliation or endorsement.",
    "fileTitle": "File:Nene郑乃馨.jpg",
    "originalSourceUrls": [
      "https://www.youtube.com/watch?v=tLaQivEs6-Y"
    ],
    "licenseReviewPending": false,
    "permissionEvidence": "Commons YouTubeReview: Techyan reviewed Ly Hai Production video tLaQivEs6-Y on 17 June 2020.",
    "urlCheck": {
      "checkedAt": "2026-10-04T07:45:50.108Z",
      "status": 200,
      "contentType": "image/jpeg"
    }
  },
  {
    "slug": "nunew",
    "status": "verified-license",
    "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/d/d3/Nunew_%40_TFSSiamSquare_THEFACESHOP_x_ZeeNuNew.png",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File%3ANunew_%40_TFSSiamSquare_THEFACESHOP_x_ZeeNuNew.png",
    "creator": "THHeadline中泰头条",
    "license": "CC BY 3.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/3.0",
    "verifiedAt": "2026-10-04T07:45:38.367Z",
    "identityEvidence": "​Nunew @ TFSSiamSquare_THEFACESHOP x ZeeNuNew",
    "photoDate": "2022-06-21",
    "credit": "YouTube – View/save archived versions on archive.org",
    "attributionRequired": true,
    "changes": "Display Commons supplied version without additional cropping or editing; retain source, creator, license and prior-change information.",
    "notes": "Historical photo for an informational artist profile; not evidence of current membership, label affiliation or endorsement.",
    "fileTitle": "File:Nunew @ TFSSiamSquare THEFACESHOP x ZeeNuNew.png",
    "originalSourceUrls": [
      "https://www.youtube.com/watch?v=UeMDHlTIoEY",
      "https://web.archive.org/web/*/https://www.youtube.com/watch?v=UeMDHlTIoEY"
    ],
    "licenseReviewPending": false,
    "permissionEvidence": "Commons YouTubeReview: ChoHyeri approved the source video license on 18 June 2023; file source identifies THHeadline video UeMDHlTIoEY.",
    "urlCheck": {
      "checkedAt": "2026-10-04T07:45:50.470Z",
      "status": 429,
      "contentType": "text/html; charset=utf-8"
    }
  },
  {
    "slug": "bus",
    "status": "unverified",
    "reason": "BUS Nestle Center 2024.png claims own work/CC0 and YouTube CC BY simultaneously; date 2025-12-31 conflicts with filename 2024. Need original publisher or reliable permission evidence.",
    "verifiedAt": "2026-10-04T07:45:38.367Z"
  },
  {
    "slug": "atlas",
    "status": "unverified",
    "reason": "Commons search ATLAS Thailand returned maps, insects and unrelated images; no identifiable band photograph with a verified license located.",
    "verifiedAt": "2026-10-04T07:45:38.367Z"
  },
  {
    "slug": "milli",
    "status": "unverified",
    "reason": "Joox on BTS - milli & youngohm.jpg depicts an advertising poster, not an original live portrait. Uploader license alone does not establish rights to underlying poster photography; hold.",
    "verifiedAt": "2026-10-04T07:45:38.367Z"
  },
  {
    "slug": "billkin",
    "status": "verified-license",
    "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/3/3f/Billkin_%40_LAHNMAH.png",
    "sourceUrl": "https://www.youtube.com/watch?v=sPpCEpC1L9M",
    "creator": "THHeadline",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
    "verifiedAt": "2026-10-04T07:56:27.646Z",
    "identityEvidence": "\"บิวกิ้น\" พูดถึงบทบาทตัวละคร \"เอ็ม\" ในภาพยนตร์ \"หลานม่า\"",
    "photoDate": "2024-02-23",
    "credit": "Screenshot hosted by Commons from THHeadline video; explicit current publisher CC BY grant checked directly.",
    "attributionRequired": true,
    "changes": "Frame extracted from THHeadline video sPpCEpC1L9M at 03m05s and hosted on Commons, displayed without further cropping or edits. Commons historic file tag says CC BY 3.0; Encore selects the current publisher CC BY 4.0 grant directly verified on YouTube.",
    "notes": "The license was verified from original public YouTube metadata, not inferred from the Commons uploader or an uncompleted Commons review. Historical image, not proof of current lineup or endorsement.",
    "fileTitle": "File:Billkin @ LAHNMAH.png",
    "originalSourceUrls": [
      "https://www.youtube.com/watch?v=sPpCEpC1L9M",
      "https://commons.wikimedia.org/wiki/File%3ABillkin_%40_LAHNMAH.png",
      "https://support.google.com/youtube/answer/2797468?hl=en"
    ],
    "licenseReviewPending": false,
    "permissionEvidence": "Original public YouTube page sPpCEpC1L9M explicitly lists Creative Commons Attribution license (reuse allowed) in its metadata License row, published by THHeadline channel UCrP1Sl6ttBcm8dkYWJkxcMw. YouTube current license help links CC BY 4.0. Commons historical CC BY 3.0 tag is retained in notes; no Commons reviewer approval is claimed.",
    "urlCheck": {
      "checkedAt": "2026-10-04T07:56:27.805Z",
      "status": 200,
      "contentType": "image/png"
    }
  },
  {
    "slug": "paper-planes",
    "status": "verified-license",
    "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/e/e2/Paper_Planes_Lactasoy_presenter_2023.jpg",
    "sourceUrl": "https://www.youtube.com/watch?v=6g4aT_N9uKY",
    "creator": "THHeadline",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
    "verifiedAt": "2026-10-04T07:56:27.646Z",
    "identityEvidence": "\"แลคตาซอย\" เปิดตัวพรีเซนเตอร์ใหม่ \"เปเปอร์ เพลนส์\" หัวหน้าแก๊งค์วัยรุ่นฟันน้ำนม",
    "photoDate": "2023-02-03",
    "credit": "Screenshot hosted by Commons from THHeadline video; explicit current publisher CC BY grant checked directly.",
    "attributionRequired": true,
    "changes": "Frame extracted from THHeadline video 6g4aT_N9uKY at 2s and hosted on Commons, displayed without further cropping or edits. Commons historic file tag says CC BY 3.0; Encore selects the current publisher CC BY 4.0 grant directly verified on YouTube.",
    "notes": "The license was verified from original public YouTube metadata, not inferred from the Commons uploader or an uncompleted Commons review. Historical image, not proof of current lineup or endorsement.",
    "fileTitle": "File:Paper Planes Lactasoy presenter 2023.jpg",
    "originalSourceUrls": [
      "https://www.youtube.com/watch?v=6g4aT_N9uKY",
      "https://commons.wikimedia.org/wiki/File%3APaper_Planes_Lactasoy_presenter_2023.jpg",
      "https://support.google.com/youtube/answer/2797468?hl=en"
    ],
    "licenseReviewPending": false,
    "permissionEvidence": "Original public YouTube page 6g4aT_N9uKY explicitly lists Creative Commons Attribution license (reuse allowed) in its metadata License row, published by THHeadline channel UCrP1Sl6ttBcm8dkYWJkxcMw. YouTube current license help links CC BY 4.0. Commons historical CC BY 3.0 tag is retained in notes; no Commons reviewer approval is claimed.",
    "urlCheck": {
      "checkedAt": "2026-10-04T07:56:28.856Z",
      "status": 200,
      "contentType": "image/jpeg"
    }
  },
  {
    "slug": "only-monday",
    "status": "unverified",
    "reason": "Exact name Commons/web searches yielded unrelated subjects; no identifiable licensed band photograph located.",
    "verifiedAt": "2026-10-04T07:45:38.367Z"
  },
  {
    "slug": "dept",
    "status": "unverified",
    "reason": "DEPT band Thailand Commons/web searches yielded unrelated institutional/military images; no identifiable licensed band photograph located.",
    "verifiedAt": "2026-10-04T07:45:38.367Z"
  },
  {
    "slug": "jorin-4eve",
    "status": "verified-license",
    "imageUrl": "https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d2/4EVE_at_9Entertain_Awards%2C_14_June_2024_01.png/960px-4EVE_at_9Entertain_Awards%2C_14_June_2024_01.png",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:4EVE%20at%209Entertain%20Awards%2C%2014%20June%202024%2001.png",
    "creator": "THHeadline",
    "license": "CC BY 3.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/3.0",
    "verifiedAt": "2026-10-04T07:56:27.646Z",
    "identityEvidence": "Source file identifies the full 4EVE group at the 9Entertain Awards on 14 June 2024. Used only as contextual band illustration on a member page; no individual face or position identification claimed.",
    "photoDate": "14 June 2024",
    "credit": "YouTube – View/save archived versions on archive.org",
    "attributionRequired": true,
    "changes": "Full historical 4EVE group image displayed as supplied; no cropping, face extraction or other changes.",
    "notes": "Shared contextual band illustration, not a verified individual portrait. Visible caption must explicitly say full 4EVE group and not individual portrait; current membership must rely on separate dated primary roster evidence.",
    "urlCheck": {
      "checkedAt": "2026-10-03T17:04:13.611Z",
      "status": 200,
      "contentType": "image/png"
    },
    "fileTitle": "File:4EVE at 9Entertain Awards, 14 June 2024 01.png",
    "originalSourceUrls": [
      "https://www.youtube.com/watch?v=wKTw2owVMxY",
      "https://web.archive.org/web/*/https://www.youtube.com/watch?v=wKTw2owVMxY"
    ],
    "licenseReviewPending": false,
    "permissionEvidence": "Commons reviewer Elphie approved the source video license on 24 August 2025.",
    "caption": "ภาพรวมวง 4EVE ที่งาน 9Entertain Awards วันที่ 14 มิถุนายน 2567 ใช้ประกอบบริบทการเป็นสมาชิกวง ไม่ใช่ภาพบุคคลเดี่ยว",
    "imageKind": "group-context"
  },
  {
    "slug": "taaom-4eve",
    "status": "verified-license",
    "imageUrl": "https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d2/4EVE_at_9Entertain_Awards%2C_14_June_2024_01.png/960px-4EVE_at_9Entertain_Awards%2C_14_June_2024_01.png",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:4EVE%20at%209Entertain%20Awards%2C%2014%20June%202024%2001.png",
    "creator": "THHeadline",
    "license": "CC BY 3.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/3.0",
    "verifiedAt": "2026-10-04T07:56:27.646Z",
    "identityEvidence": "Source file identifies the full 4EVE group at the 9Entertain Awards on 14 June 2024. Used only as contextual band illustration on a member page; no individual face or position identification claimed.",
    "photoDate": "14 June 2024",
    "credit": "YouTube – View/save archived versions on archive.org",
    "attributionRequired": true,
    "changes": "Full historical 4EVE group image displayed as supplied; no cropping, face extraction or other changes.",
    "notes": "Shared contextual band illustration, not a verified individual portrait. Visible caption must explicitly say full 4EVE group and not individual portrait; current membership must rely on separate dated primary roster evidence.",
    "urlCheck": {
      "checkedAt": "2026-10-03T17:04:13.611Z",
      "status": 200,
      "contentType": "image/png"
    },
    "fileTitle": "File:4EVE at 9Entertain Awards, 14 June 2024 01.png",
    "originalSourceUrls": [
      "https://www.youtube.com/watch?v=wKTw2owVMxY",
      "https://web.archive.org/web/*/https://www.youtube.com/watch?v=wKTw2owVMxY"
    ],
    "licenseReviewPending": false,
    "permissionEvidence": "Commons reviewer Elphie approved the source video license on 24 August 2025.",
    "caption": "ภาพรวมวง 4EVE ที่งาน 9Entertain Awards วันที่ 14 มิถุนายน 2567 ใช้ประกอบบริบทการเป็นสมาชิกวง ไม่ใช่ภาพบุคคลเดี่ยว",
    "imageKind": "group-context"
  },
  {
    "slug": "fai-4eve",
    "status": "verified-license",
    "imageUrl": "https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d2/4EVE_at_9Entertain_Awards%2C_14_June_2024_01.png/960px-4EVE_at_9Entertain_Awards%2C_14_June_2024_01.png",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:4EVE%20at%209Entertain%20Awards%2C%2014%20June%202024%2001.png",
    "creator": "THHeadline",
    "license": "CC BY 3.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/3.0",
    "verifiedAt": "2026-10-04T07:56:27.646Z",
    "identityEvidence": "Source file identifies the full 4EVE group at the 9Entertain Awards on 14 June 2024. Used only as contextual band illustration on a member page; no individual face or position identification claimed.",
    "photoDate": "14 June 2024",
    "credit": "YouTube – View/save archived versions on archive.org",
    "attributionRequired": true,
    "changes": "Full historical 4EVE group image displayed as supplied; no cropping, face extraction or other changes.",
    "notes": "Shared contextual band illustration, not a verified individual portrait. Visible caption must explicitly say full 4EVE group and not individual portrait; current membership must rely on separate dated primary roster evidence.",
    "urlCheck": {
      "checkedAt": "2026-10-03T17:04:13.611Z",
      "status": 200,
      "contentType": "image/png"
    },
    "fileTitle": "File:4EVE at 9Entertain Awards, 14 June 2024 01.png",
    "originalSourceUrls": [
      "https://www.youtube.com/watch?v=wKTw2owVMxY",
      "https://web.archive.org/web/*/https://www.youtube.com/watch?v=wKTw2owVMxY"
    ],
    "licenseReviewPending": false,
    "permissionEvidence": "Commons reviewer Elphie approved the source video license on 24 August 2025.",
    "caption": "ภาพรวมวง 4EVE ที่งาน 9Entertain Awards วันที่ 14 มิถุนายน 2567 ใช้ประกอบบริบทการเป็นสมาชิกวง ไม่ใช่ภาพบุคคลเดี่ยว",
    "imageKind": "group-context"
  },
  {
    "slug": "punch-4eve",
    "status": "verified-license",
    "imageUrl": "https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d2/4EVE_at_9Entertain_Awards%2C_14_June_2024_01.png/960px-4EVE_at_9Entertain_Awards%2C_14_June_2024_01.png",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:4EVE%20at%209Entertain%20Awards%2C%2014%20June%202024%2001.png",
    "creator": "THHeadline",
    "license": "CC BY 3.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/3.0",
    "verifiedAt": "2026-10-04T07:56:27.646Z",
    "identityEvidence": "Source file identifies the full 4EVE group at the 9Entertain Awards on 14 June 2024. Used only as contextual band illustration on a member page; no individual face or position identification claimed.",
    "photoDate": "14 June 2024",
    "credit": "YouTube – View/save archived versions on archive.org",
    "attributionRequired": true,
    "changes": "Full historical 4EVE group image displayed as supplied; no cropping, face extraction or other changes.",
    "notes": "Shared contextual band illustration, not a verified individual portrait. Visible caption must explicitly say full 4EVE group and not individual portrait; current membership must rely on separate dated primary roster evidence.",
    "urlCheck": {
      "checkedAt": "2026-10-03T17:04:13.611Z",
      "status": 200,
      "contentType": "image/png"
    },
    "fileTitle": "File:4EVE at 9Entertain Awards, 14 June 2024 01.png",
    "originalSourceUrls": [
      "https://www.youtube.com/watch?v=wKTw2owVMxY",
      "https://web.archive.org/web/*/https://www.youtube.com/watch?v=wKTw2owVMxY"
    ],
    "licenseReviewPending": false,
    "permissionEvidence": "Commons reviewer Elphie approved the source video license on 24 August 2025.",
    "caption": "ภาพรวมวง 4EVE ที่งาน 9Entertain Awards วันที่ 14 มิถุนายน 2567 ใช้ประกอบบริบทการเป็นสมาชิกวง ไม่ใช่ภาพบุคคลเดี่ยว",
    "imageKind": "group-context"
  },
  {
    "slug": "klear",
    "status": "unverified",
    "reason": "Klear logo.png is an unrelated analytics-company logo; no licensed Thai band portrait located.",
    "verifiedAt": "2026-10-04T07:45:38.367Z"
  },
  {
    "slug": "lomosonic",
    "status": "unverified",
    "reason": "Commons exact-name search returned no files; web search did not locate a photograph with verified reuse permission.",
    "verifiedAt": "2026-10-04T07:45:38.367Z"
  },
  {
    "slug": "num-kala",
    "status": "unverified",
    "reason": "Num Kala/Kala singer searches returned unrelated subjects; no identifiable licensed singer portrait located.",
    "verifiedAt": "2026-10-04T07:45:38.367Z"
  },
  {
    "slug": "urboytj",
    "status": "unverified",
    "reason": "Commons exact-name and web search returned unrelated subjects; no identifiable licensed singer portrait located.",
    "verifiedAt": "2026-10-04T07:45:38.367Z"
  },
  {
    "slug": "lykn",
    "status": "verified-license",
    "imageUrl": "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/33/LYKN_2024-09-23.png/960px-LYKN_2024-09-23.png",
    "sourceUrl": "https://www.youtube.com/watch?v=e_HHG1N2eIY",
    "creator": "THHeadline",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
    "verifiedAt": "2026-10-04T07:56:27.646Z",
    "identityEvidence": "5หนุ่ม \"LYKN\" เผย ดีใจบัตรคอนเสิร์ตSold out!! พร้อมสปอยโชว์ มีครบทุกรสชาติ!!!",
    "photoDate": "2024-09-23",
    "credit": "Screenshot hosted by Commons from THHeadline video; explicit current publisher CC BY grant checked directly.",
    "attributionRequired": true,
    "changes": "Frame extracted from THHeadline video e_HHG1N2eIY and hosted on Commons; extraction timestamp not supplied in Commons source. Displayed without further cropping or edits. Commons historic file tag says CC BY 3.0; Encore selects the current publisher CC BY 4.0 grant directly verified on YouTube.",
    "notes": "The license was verified from original public YouTube metadata, not inferred from the Commons uploader or an uncompleted Commons review. Historical image, not proof of current lineup or endorsement.",
    "fileTitle": "File:LYKN 2024-09-23.png",
    "originalSourceUrls": [
      "https://www.youtube.com/watch?v=e_HHG1N2eIY",
      "https://commons.wikimedia.org/wiki/File%3ALYKN_2024-09-23.png",
      "https://support.google.com/youtube/answer/2797468?hl=en"
    ],
    "licenseReviewPending": false,
    "permissionEvidence": "Original public YouTube page e_HHG1N2eIY explicitly lists Creative Commons Attribution license (reuse allowed) in its metadata License row, published by THHeadline channel UCrP1Sl6ttBcm8dkYWJkxcMw. YouTube current license help links CC BY 4.0. Commons historical CC BY 3.0 tag is retained in notes; no Commons reviewer approval is claimed.",
    "urlCheck": {
      "checkedAt": "2026-10-04T07:56:29.921Z",
      "status": 200,
      "contentType": "image/png"
    }
  }
];
