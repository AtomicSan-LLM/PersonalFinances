function lum(h){h=h.replace('#','');const c=[0,2,4].map(i=>parseInt(h.substr(i,2),16)/255).map(v=>v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4));return .2126*c[0]+.7152*c[1]+.0722*c[2];}
function cr(a,b){const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
const pares = JSON.parse(process.argv[2]);
let mal=0;
for (const [n,a,b,min] of pares){const r=cr(a,b);const ok=r>=min; if(!ok)mal++; console.log((ok?'OK ':'MAL')+' '+r.toFixed(2)+' (>= '+min+')  '+n+'  '+a+' / '+b);}
process.exit(mal?1:0);
