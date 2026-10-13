import { readFileSync, writeFileSync } from 'node:fs';
const path='scripts/build-occasion-templates.mjs';
let source=readFileSync(path,'utf8');
const edits=[
  ["T('OPENING\\nOUR DOORS',85,752,830,74", "T('OPENING\\nOUR DOORS',85,759,830,61"],
  ["T('A table\\nfor two.',120,700,760,105", "T('A table\\nfor two.',120,709,760,90"],
  ["R(660,0,180,1000,ink,0,15)","R(785,0,160,1000,'#c1ce55',0,15)"],
  ["T('WE\\nSAID\\nYES.',90,400,830,150", "T('WE\\nSAID\\nYES.',90,400,830,132"],
  ["'Coastal hotel weekend'","'Alpine lakeside weekend'"],
  ["'THE COASTAL WEEKEND'","'THE LAKESIDE WEEKEND'"],
  ["Two nights. Ocean air. Room to breathe.","Two nights. Alpine air. Room to breathe."],
  ["BOOK YOUR STAY / HARBOR HOUSE","BOOK YOUR STAY / LAKE HOUSE"],
  ["'THE COASTAL ITINERARY'","'THE ALPINE ITINERARY'"],
  ["Coastal walk · Explore the old town","Lakeside walk · Explore the village"],
  ["Coffee by the sea · One last swim","Coffee by the lake · One last swim"],
];
for(const [before,after] of edits){if(!source.includes(before))throw new Error('Missing expected recipe: '+before);source=source.replace(before,after);}
writeFileSync(path,source);
