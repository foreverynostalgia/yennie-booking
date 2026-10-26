import {NextRequest} from 'next/server';
import {admin,db,json} from '@/lib/server';
import {decryptStudentPin} from '@/lib/student-pin';
import {verifyPin} from '@/lib/students';
const result=(value:unknown,status=200)=>{const response=json(value,status);response.headers.set('Cache-Control','no-store, private');response.headers.set('Pragma','no-cache');return response};
export async function GET(req:NextRequest){
 if(!await admin(req))return result({error:'PIN 확인은 전체 권한 관리자만 가능합니다.'},403);
 try{
  const id=new URL(req.url).searchParams.get('id')||'';if(!id)return result({error:'학생을 선택해 주세요.'},400);
  const row=await db().prepare('SELECT nickname,pin_hash,pin_encrypted FROM students WHERE id=?').bind(id).first<{nickname:string;pin_hash:string;pin_encrypted:string|null}>();
  if(!row)return result({error:'학생을 찾을 수 없습니다.'},404);
  if(!row.pin_encrypted)return result({pin:null,message:'기존에 발급한 PIN은 다시 확인할 수 없습니다. PIN을 재발급하면 이후부터 확인할 수 있습니다.'});
  const pin=await decryptStudentPin(row.pin_encrypted,id);
  if(!await verifyPin(pin,row.pin_hash))throw new Error('저장된 PIN이 일치하지 않습니다.');
  return result({nickname:row.nickname,pin});
 }catch{return result({error:'PIN을 확인하지 못했습니다. 다시 시도하거나 PIN을 재발급해 주세요.'},503)}
}
