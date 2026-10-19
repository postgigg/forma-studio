import { FabricImage, filters } from 'fabric';

export type PhotoGrade = { id: string; amount: number };
type Grade = { id: string; name: string; family: string; matrix: number[] };
const matrix = (r: number, g: number, b: number, biasR = 0, biasG = 0, biasB = 0, mix = 0): number[] =>
  [r, mix, 0, 0, biasR, 0, g, mix, 0, biasG, mix, 0, b, 0, biasB, 0, 0, 0, 1, 0];
const grade = (id: string, name: string, family: string, values: number[]): Grade => ({ id, name, family, matrix: values });
const mono = [.2126,.7152,.0722,0,0,.2126,.7152,.0722,0,0,.2126,.7152,.0722,0,0,0,0,0,1,0];
// Twenty-five new treatments plus the three original looks. Matrices are
// deterministic, reversible and portable through Fabric's native serialization.
export const photoGrades: Grade[] = [
  grade('mono','Mono','Black & white',mono),
  grade('warm','Warm','Warm',matrix(1.09,1.02,.86,.025,.008,.005)),
  grade('vivid','Vivid','Color',matrix(1.18,1.18,1.18,-.065,-.065,-.065)),
  grade('porcelain','Porcelain','Editorial',matrix(.96,.96,.94,.045,.042,.05)),
  grade('linen','Linen','Editorial',matrix(.94,.91,.83,.06,.06,.065)),
  grade('newsprint','Newsprint','Black & white',mono.map((n,i)=>i===4||i===9||i===14?.07:(i===18?1:n*.85))),
  grade('carbon','Carbon','Black & white',mono.map((n,i)=>i===4||i===9||i===14?-.11:(i===18?1:n*1.23))),
  grade('silver','Silver','Black & white',[.24,.68,.08,0,.01,.22,.68,.10,0,.018,.22,.68,.10,0,.045,0,0,0,1,0]),
  grade('sepia','Sepia','Warm',[.393,.769,.189,0,0,.349,.686,.168,0,0,.272,.534,.131,0,0,0,0,0,1,0]),
  grade('copper','Copper','Warm',matrix(1.13,.95,.8,.02,.015,.025)),
  grade('amber','Amber','Warm',matrix(1.07,1.01,.79,.04,.02,.015)),
  grade('golden-hour','Golden hour','Warm',matrix(1.08,1.02,.88,.035,.018,-.01)),
  grade('rosewater','Rosewater','Pastel',matrix(1.03,.9,.97,.055,.045,.055)),
  grade('peach','Peach','Pastel',matrix(1.03,.94,.85,.05,.035,.04)),
  grade('lavender','Lavender','Pastel',matrix(.96,.91,1.04,.04,.035,.06)),
  grade('pistachio','Pistachio','Pastel',matrix(.95,1.02,.88,.035,.035,.055)),
  grade('ice','Ice','Cool',matrix(.89,1.01,1.12,.025,.018,.01)),
  grade('slate','Slate','Cool',matrix(.88,.95,1.02,.025,.02,.03)),
  grade('ocean','Ocean','Cool',matrix(.88,1.03,1.14,-.005,.005,.01)),
  grade('alpine','Alpine','Cool',matrix(.94,1.07,1.04,.005,-.015,.005)),
  grade('teal-orange','Teal & orange','Cinema',[1.12,.04,-.10,0,.01,-.03,1.02,.04,0,0,.03,.05,.91,0,.045,0,0,0,1,0]),
  grade('nocturne','Nocturne','Cinema',matrix(.86,.88,1.03,-.025,-.02,.015)),
  grade('matinee','Matinee','Cinema',matrix(1.08,1.01,.9,-.03,-.015,.015)),
  grade('bleach','Bleach bypass','Cinema',[.8,.35,.05,0,-.1,.15,1,.05,0,-.1,.15,.35,.7,0,-.1,0,0,0,1,0]),
  grade('faded-film','Faded film','Film',matrix(.84,.84,.8,.085,.075,.09)),
  grade('instant','Instant','Film',matrix(.97,.98,.85,.02,.025,.045)),
  grade('cross-process','Cross process','Film',[1.09,.05,0,0,-.035,0,1.07,.04,0,-.025,.03,0,.88,0,.055,0,0,0,1,0]),
  grade('punch','Punch','Color',matrix(1.28,1.24,1.2,-.11,-.09,-.07)),
];
export type GradedImage = FabricImage & { photoGrades?: PhotoGrade[]; photoBrightness?: number };
export function validGrades(value: unknown): PhotoGrade[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0,6).filter(v => v && photoGrades.some(g => g.id === v.id) && Number.isFinite(v.amount))
    .map(v => ({ id: v.id, amount: Math.min(1,Math.max(0,v.amount)) }));
}
export function applyPhotoGrades(image: GradedImage, grades: PhotoGrade[]) {
  const previous=validGrades(image.photoGrades);
  const original=image.filters.filter(f=>f.type!=='Brightness');
  const base=original.slice(0,Math.max(0,original.length-previous.length));
  image.photoGrades = validGrades(grades);
  const brightness = image.filters.find(f => f.type === 'Brightness') as InstanceType<typeof filters.Brightness> | undefined;
  image.photoBrightness = image.photoBrightness ?? brightness?.brightness ?? 0;
  image.filters = [...base,...image.photoGrades.map(layer => {
    const m = photoGrades.find(g => g.id === layer.id)!.matrix.map((n,i) => {
      const identity = [0,6,12,18].includes(i) ? 1 : 0;
      return identity + (n-identity)*layer.amount;
    });
    return new filters.ColorMatrix({ matrix: m, colorsOnly: true });
  })];
  if (image.photoBrightness) image.filters.push(new filters.Brightness({ brightness: image.photoBrightness }));
  image.applyFilters();
}
