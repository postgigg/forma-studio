"""Build Forma's original geometric display typefaces from authored stroke paths.
No third-party font outlines are used. Run with Python and fontTools.
"""
from pathlib import Path
from math import sin, cos, pi, hypot
import json, unicodedata
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib.tables._k_e_r_n import KernTable_format_0
from fontTools.ttLib import newTable

OUT = Path(__file__).resolve().parents[1] / 'public' / 'fonts'
OUT.mkdir(parents=True, exist_ok=True)
def line(*points): return list(points)
def arc(cx,cy,rx,ry,start=0,end=360,steps=32):
    return [(cx+rx*cos((start+(end-start)*i/steps)*pi/180), cy+ry*sin((start+(end-start)*i/steps)*pi/180)) for i in range(steps+1)]
def curve(a,b,c,d,n=22):
    return [((1-t)**3*a[0]+3*(1-t)**2*t*b[0]+3*(1-t)*t*t*c[0]+t**3*d[0],(1-t)**3*a[1]+3*(1-t)**2*t*b[1]+3*(1-t)*t*t*c[1]+t**3*d[1]) for t in [i/n for i in range(n+1)]]
P={
'A':[line((20,0),(260,700),(500,0)),line((103,242),(417,242))],
'B':[line((40,0),(40,700),(265,700)),curve((265,700),(575,700),(560,365),(275,365)),line((40,365),(275,365)),curve((275,365),(600,365),(590,0),(270,0)),line((270,0),(40,0))],
'C':[arc(275,350,255,350,45,315)],
'D':[line((40,0),(40,700),(210,700)),curve((210,700),(650,700),(650,0),(210,0)),line((210,0),(40,0))],
'E':[line((480,700),(40,700),(40,0),(480,0)),line((40,350),(400,350))],
'F':[line((40,0),(40,700),(480,700)),line((40,365),(400,365))],
'G':[arc(280,350,255,350,45,350),line((530,290),(530,0),(280,0)),line((300,290),(530,290))],
'H':[line((40,0),(40,700)),line((500,0),(500,700)),line((40,350),(500,350))],
'I':[line((65,0),(65,700))],
'J':[line((380,700),(380,180)),curve((380,180),(380,-80),(20,-65),(20,140))],
'K':[line((40,0),(40,700)),line((490,700),(40,295),(510,0))],
'L':[line((40,700),(40,0),(465,0))],
'M':[line((40,0),(40,700),(310,235),(580,700),(580,0))],
'N':[line((40,0),(40,700),(510,0),(510,700))],
'O':[arc(275,350,255,350)],
'P':[line((40,0),(40,700),(270,700)),curve((270,700),(590,700),(590,335),(270,335)),line((270,335),(40,335))],
'Q':[arc(275,350,255,350),line((320,160),(540,-75))],
'R':[line((40,0),(40,700),(270,700)),curve((270,700),(590,700),(590,335),(270,335)),line((270,335),(40,335)),line((260,335),(525,0))],
'S':[curve((490,615),(265,845),(-145,635),(140,390))+curve((140,390),(225,330),(505,330),(510,165))[1:]+curve((510,165),(525,-80),(160,-50),(20,80))[1:]],
'T':[line((0,700),(520,700)),line((260,700),(260,0))],
'U':[line((40,700),(40,215)),curve((40,215),(40,-75),(510,-75),(510,215)),line((510,215),(510,700))],
'V':[line((10,700),(270,0),(530,700))],
'W':[line((0,700),(155,0),(325,475),(495,0),(650,700))],
'X':[line((20,700),(510,0)),line((510,700),(20,0))],
'Y':[line((0,700),(260,350),(520,700)),line((260,350),(260,0))],
'Z':[line((20,700),(510,700),(20,0),(510,0))],
'a':[arc(235,235,215,235),line((450,470),(450,0))],
'b':[line((35,700),(35,0)),arc(250,235,215,235)],
'c':[arc(240,235,220,235,45,315)],
'd':[line((450,700),(450,0)),arc(235,235,215,235)],
'e':[arc(240,235,220,235,0,315),line((20,235),(460,235))],
'f':[line((100,0),(100,535)),curve((100,535),(100,720),(275,750),(340,680)),line((0,470),(295,470))],
'g':[arc(235,235,215,235),line((450,470),(450,-55)),curve((450,-55),(450,-230),(140,-250),(55,-135))],
'h':[line((35,0),(35,700)),curve((35,290),(35,550),(440,550),(440,290)),line((440,290),(440,0))],
'i':[line((60,0),(60,470)),line((60,650),(60,660))],
'j':[line((175,470),(175,-80)),curve((175,-80),(175,-220),(5,-220),(-30,-145)),line((175,650),(175,660))],
'k':[line((35,0),(35,700)),line((395,470),(35,175),(430,0))],
'l':[line((60,700),(60,0))],
'm':[line((35,0),(35,470)),curve((35,285),(35,545),(340,545),(340,285)),line((340,285),(340,0)),curve((340,285),(340,545),(645,545),(645,285)),line((645,285),(645,0))],
'n':[line((35,0),(35,470)),curve((35,285),(35,545),(440,545),(440,285)),line((440,285),(440,0))],
'o':[arc(240,235,220,235)],
'p':[line((35,-220),(35,470)),arc(250,235,215,235)],
'q':[line((450,-220),(450,470)),arc(235,235,215,235)],
'r':[line((35,0),(35,470)),curve((35,285),(35,470),(230,555),(350,450))],
's':[curve((395,420),(225,555),(-105,395),(115,265))+curve((115,265),(190,225),(425,240),(425,100))[1:]+curve((425,100),(425,-45),(125,-50),(20,60))[1:]],
't':[line((110,650),(110,120)),curve((110,120),(110,-30),(260,-30),(330,40)),line((0,470),(300,470))],
'u':[line((35,470),(35,165)),curve((35,165),(35,-70),(440,-70),(440,165)),line((440,470),(440,0))],
'v':[line((10,470),(225,0),(440,470))],
'w':[line((0,470),(135,0),(280,340),(425,0),(560,470))],
'x':[line((20,470),(430,0)),line((430,470),(20,0))],
'y':[line((10,470),(230,0)),line((455,470),(180,-185),(75,-220))],
'z':[line((20,470),(420,470),(20,0),(420,0))],
'0':[arc(255,350,225,350)],
'1':[line((30,540),(215,700),(215,0)),line((40,0),(390,0))],
'2':[curve((25,555),(45,805),(500,785),(490,565)),curve((490,565),(490,390),(100,150),(20,0)),line((20,0),(500,0))],
'3':[curve((20,620),(200,800),(590,720),(470,475)),curve((470,475),(440,410),(330,360),(260,360)),curve((260,360),(560,385),(605,0),(290,0)),curve((290,0),(150,-15),(70,30),(20,80))],
'4':[line((390,0),(390,700),(0,230),(525,230))],
'5':[line((480,700),(70,700),(40,375)),curve((40,375),(590,560),(650,-45),(205,0)),curve((205,0),(130,0),(55,35),(15,80))],
'6':[curve((475,620),(255,850),(-10,580),(25,240)),arc(260,220,230,220)],
'7':[line((0,700),(500,700),(145,0))],
'8':[arc(255,530,205,170),arc(255,180,235,180)],
'9':[arc(255,480,230,220),curve((485,480),(530,180),(310,-100),(45,60))],
'.':[line((60,0),(60,8))], ',':[line((90,10),(40,-105))], ':':[line((60,100),(60,110)),line((60,410),(60,420))], ';':[line((90,100),(40,-15)),line((90,410),(90,420))],
'!':[line((60,700),(60,210)),line((60,0),(60,10))], '?':[curve((10,580),(45,820),(485,735),(390,510)),curve((390,510),(360,430),(205,440),(205,240)),line((205,0),(205,10))],
'-':[line((15,280),(280,280))], '_':[line((0,-130),(480,-130))], '+':[line((0,310),(480,310)),line((240,70),(240,550))], '=':[line((0,210),(480,210)),line((0,420),(480,420))],
'/':[line((0,-60),(380,760))], '\\':[line((0,760),(380,-60))],
'(':[curve((200,760),(-60,620),(-60,70),(200,-110))], ')':[curve((0,760),(260,620),(260,70),(0,-110))],
'[':[line((210,760),(40,760),(40,-100),(210,-100))], ']':[line((0,760),(170,760),(170,-100),(0,-100))],
'{':[line((230,760),(130,760),(130,425),(25,330),(130,235),(130,-100),(230,-100))], '}':[line((0,760),(100,760),(100,425),(205,330),(100,235),(100,-100),(0,-100))],
'<':[line((330,560),(20,310),(330,60))], '>':[line((20,560),(330,310),(20,60))],
'%':[arc(105,580,95,120),arc(410,120,95,120),line((0,0),(510,700))],
'#':[line((145,0),(230,700)),line((340,0),(425,700)),line((0,230),(510,230)),line((35,475),(545,475))],
'*':[line((210,700),(210,320)),line((30,570),(390,450)),line((390,570),(30,450))],
'|':[line((50,-120),(50,760))], '"':[line((40,700),(40,515)),line((210,700),(210,515))], "'":[line((60,700),(60,515))],
'`':[line((20,770),(125,685))], '^':[line((0,485),(210,700),(420,485))], '~':[curve((0,310),(160,505),(260,115),(420,310))],
'$':[curve((475,610),(240,825),(-100,610),(150,380))+curve((150,380),(255,305),(520,340),(510,140))[1:]+curve((510,140),(490,-70),(170,-35),(15,85))[1:],line((270,-90),(270,790))],
'&':[curve((450,0),(150,285),(-50,585),(215,700))+curve((215,700),(465,745),(520,475),(210,320))[1:]+curve((210,320),(-195,80),(175,-270),(500,185))[1:]],
'@':[arc(315,345,300,340,20,320),arc(305,325,145,180),line((450,500),(450,135)),curve((450,135),(665,65),(705,390),(598,500))],
}
P[' ']=[]
P['–']=[line((0,280),(560,280))];P['—']=[line((0,280),(820,280))]
P['•']=[arc(70,290,35,35)]
P['°']=[arc(120,580,100,100)]
P['×']=[line((15,90),(400,475)),line((15,475),(400,90))]
P['÷']=[line((0,280),(420,280)),line((210,80),(210,90)),line((210,470),(210,480))]
P['€']=[arc(290,350,250,350,45,315),line((0,270),(345,270)),line((0,430),(365,430))]
P['£']=[curve((405,600),(160,845),(40,550),(155,355)),line((155,355),(155,0),(470,0)),line((20,350),(340,350))]
P['‘']=P["'"];P['’']=P["'"];P['“']=P['"'];P['”']=P['"']
marks={
'\u0301':[line((190,805),(335,915))], '\u0300':[line((190,915),(335,805))],
'\u0302':[line((115,810),(265,915),(415,810))], '\u0303':[curve((100,825),(200,965),(315,725),(425,865))],
'\u0308':[line((145,855),(145,863)),line((365,855),(365,863))], '\u030a':[arc(265,855,55,55)],
'\u0327':[line((250,-40),(310,-135),(190,-200))],
}
for code in range(192,256):
    char=chr(code); decomposed=unicodedata.normalize('NFD',char)
    if len(decomposed)==2 and decomposed[0] in P and decomposed[1] in marks:
        base=decomposed[0];shift=-190 if base.islower() and base not in 'bdfhklt' else 0
        P[char]=P[base]+[[(x,y+shift if y>700 else y) for x,y in path] for path in marks[decomposed[1]]]
P['ø']=P['o']+[line((10,-50),(470,520))];P['Ø']=P['O']+[line((0,-50),(550,750))]
P['ß']=[line((35,0),(35,500)),curve((35,500),(35,785),(495,755),(320,420)),curve((320,420),(235,325),(460,315),(445,155)),curve((445,155),(438,-20),(290,-10),(190,40))]

def polygon(pen,points):
    # Same winding makes overlapping strokes render as a single filled outline.
    area=sum(points[i][0]*points[(i+1)%len(points)][1]-points[(i+1)%len(points)][0]*points[i][1] for i in range(len(points)))
    if area>0:points=points[::-1]
    pen.moveTo(tuple(round(v) for v in points[0]))
    for point in points[1:]:pen.lineTo(tuple(round(v) for v in point))
    pen.closePath()

families=[('Forma Frame',62,1.0,False,70),('Forma Soft',86,1.0,True,68),('Forma Deco',36,.72,False,95),('Forma Outline',24,1.13,True,95)]
manifest=[]
for family,weight,squeeze,rounded,spacing in families:
    glyphs={};metrics={};mapping={ord(c):f'uni{ord(c):04X}' for c in P}
    mapping[160]='uni0020'
    for char,paths in P.items():
        pen=TTGlyphPen(None)
        # Separate authored lowercase, punctuation and accents are retained in every family.
        paths=[[(x*squeeze+weight/2+25,y) for x,y in part] for part in paths]
        if family=='Forma Deco' and char in 'AEFH':
            paths=[[(x,y-80 if 230<y<430 else y) for x,y in part] for part in paths]
        for points in paths:
            for (x1,y1),(x2,y2) in zip(points,points[1:]):
                length=hypot(x2-x1,y2-y1)
                if length<.1:continue
                dx=-(y2-y1)/length*weight/2;dy=(x2-x1)/length*weight/2
                polygon(pen,[(x1+dx,y1+dy),(x2+dx,y2+dy),(x2-dx,y2-dy),(x1-dx,y1-dy)])
            # Rounded joins avoid seams even in the structured families; only Soft has round terminals.
            joints=points if rounded else points[1:-1]
            for x,y in joints:polygon(pen,arc(x,y,weight/2,weight/2,steps=12)[:-1])
        glyph=pen.glyph()
        if glyph.numberOfContours>0:glyph.flags[0]|=0x40
        name=mapping[ord(char)];glyphs[name]=glyph
        right=max([x for path in paths for x,y in path],default=230)
        metrics[name]=(round(right+weight/2+spacing),0)
    pen=TTGlyphPen(None);polygon(pen,[(40,0),(400,0),(400,700),(40,700)]);glyphs['.notdef']=pen.glyph();metrics['.notdef']=(500,0)
    order=['.notdef']+list(glyphs.keys())[:-1]
    builder=FontBuilder(1000,isTTF=True);builder.setupGlyphOrder(order);builder.setupCharacterMap(mapping);builder.setupGlyf(glyphs);builder.setupHorizontalMetrics(metrics)
    builder.setupHorizontalHeader(ascent=980,descent=-260,lineGap=0)
    slug=family.replace(' ','')
    builder.setupNameTable({'familyName':family,'styleName':'Regular','uniqueFontIdentifier':f'FormaStudio:{slug}:1.0','fullName':family+' Regular','psName':slug+'-Regular','version':'Version 1.0','copyright':'Original geometry by Forma Studio, 2026.','licenseDescription':'Original Forma Studio outlines. Free to use, modify, embed and redistribute with Forma Studio.'})
    builder.setupOS2(sTypoAscender=980,sTypoDescender=-260,sTypoLineGap=0,usWinAscent=980,usWinDescent=260,usWeightClass=400,fsType=0)
    builder.setupPost();builder.setupMaxp()
    kern=newTable('kern');kern.version=0;sub=KernTable_format_0();sub.version=0;sub.coverage=1
    sub.kernTable={(mapping[ord(a)],mapping[ord(b)]):-round(45*squeeze) for a,b in ['AV','AW','AT','AY','FA','LT','LV','LY','PA','TA','To','Te','Ty','VA','Vo','WA','Wo','YA','Yo']}
    kern.kernTables=[sub];builder.font['kern']=kern
    filename=slug.lower()+'.ttf';builder.save(OUT/filename)
    manifest.append({'family':family,'file':'/fonts/'+filename,'glyphs':len(glyphs),'source':'Original vector stroke geometry; AI-authored, built with fontTools','license':'Unrestricted use and embedding'})
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print(json.dumps(manifest,indent=2))
