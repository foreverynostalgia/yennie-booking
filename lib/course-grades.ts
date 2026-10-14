export const middleGrades=['중1','중2','중3'];
export function parseTargetGrades(value:unknown):string[]{
 try{const grades=typeof value==='string'?JSON.parse(value):value;if(Array.isArray(grades))return grades.filter((grade):grade is string=>typeof grade==='string'&&middleGrades.includes(grade))}catch{}
 return [...middleGrades];
}
export const acceptsGrade=(value:unknown,grade:string)=>parseTargetGrades(value).includes(grade);
