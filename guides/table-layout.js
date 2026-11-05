/* Preserve source coordinates when HTML assigns cells to its implicit grid. */
((root) => {
  'use strict';
  function layout(table) {
    const columns=table.widths.length,occupied=Array(columns).fill(0);
    const rows=table.rows.map((row,r)=>{
      const cells=new Map(row.map(cell=>[cell.c,cell])),out=[];
      for(let c=0;c<columns;){
        if(occupied[c]>r){c++;continue;}
        const cell=cells.get(c);
        if(cell){
          out.push(cell);
          for(let k=c;k<c+(cell.cs||1);k++)occupied[k]=r+(cell.rs||1);
          c+=cell.cs||1;
        }else{
          const start=c++;
          while(c<columns&&occupied[c]<=r&&!cells.has(c))c++;
          out.push({c:start,cs:c-start,rs:1,text:''});
        }
      }
      return out;
    });
    let head=Math.min(table.head||0,rows.length-1);
    // A rowspan cannot cross a THEAD/TBODY boundary: browsers shorten it and
    // shift following cells. Include the complete connected header group.
    for(let r=0;r<head;r++)for(const cell of rows[r])head=Math.max(head,r+(cell.rs||1));
    if(head>=rows.length)head=0;
    return {rows,head};
  }
  if(typeof module==='object'&&module.exports)module.exports={layout};
  else root.ScholarGuideTables={layout};
})(typeof window==='undefined'?globalThis:window);
