const SIZE={width:168,height:36};
function nearCursor(cursor,monitors,size=SIZE){
 const bounds=monitors.map(m=>{
  const rotated=[1,3,5,7].includes(m.transform);
  return {x:m.x,y:m.y,width:(rotated?m.height:m.width)/m.scale,height:(rotated?m.width:m.height)/m.scale};
 });
 const m=bounds.find(m=>cursor.x>=m.x&&cursor.x<m.x+m.width&&cursor.y>=m.y&&cursor.y<m.y+m.height)||bounds[0];
 if(!m)throw Error('Écran indisponible.');
 const gap=16,margin=6;
 let x=cursor.x+gap,y=cursor.y+gap;
 if(x+size.width>m.x+m.width-margin)x=cursor.x-size.width-gap;
 if(y+size.height>m.y+m.height-margin)y=cursor.y-size.height-gap;
 return {x:Math.round(Math.max(m.x+margin,Math.min(x,m.x+m.width-size.width-margin))),y:Math.round(Math.max(m.y+margin,Math.min(y,m.y+m.height-size.height-margin))),...size};
}
module.exports={SIZE,nearCursor};
