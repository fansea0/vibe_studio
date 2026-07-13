import type {IncomingMessage,ServerResponse} from 'node:http'
import {RepositoryError} from './sqlite.js'
import {GitLogError,readGitLog} from './gitLog.js'
export function createApiHandler({repository,readGitLog:reader=readGitLog}:{repository:any;readGitLog?:typeof readGitLog}) {
 const send=(res:ServerResponse,status:number,body:any)=>{res.statusCode=status;res.setHeader('content-type','application/json');res.end(JSON.stringify(body))}
 const body=async(req:IncomingMessage)=>{let s=''; for await(const c of req){s+=c; if(Buffer.byteLength(s)>1024*1024) throw Object.assign(new Error('too large'),{status:400})}; if(!s)return {}; try{return JSON.parse(s)}catch{throw Object.assign(new Error('invalid json'),{status:400})}}
 const map=(e:any)=>{if(e instanceof RepositoryError)return {status:e.code==='NOT_FOUND'?404:e.code==='CONFLICT'||e.code==='DUPLICATE'?409:400,body:{error:{code:e.code,message:e.message}}}; if(e instanceof GitLogError)return {status:e.code==='GIT_REPOSITORY_INVALID'?400:500,body:{error:{code:e.code,message:e.message}}}; return {status:500,body:{error:{code:'INTERNAL_ERROR',message:'Internal error'}}}}
 return async(req:IncomingMessage,res:ServerResponse)=>{try{const u=new URL(req.url||'','http://localhost'); const p0=u.pathname; const p=p0.startsWith('/api')?p0:`/api${p0}`; const method=req.method||'GET';
   if(p==='/api/products'){if(method==='GET'){const products=repository.listProducts(true); return send(res,200,{data:products.map((x:any)=>repository.getProductSummary(x.id))})}; if(method==='POST'){const b=await body(req); return send(res,201,{data:repository.createProduct(b)})}}
   let m=p.match(/^\/api\/products\/([^/]+)(?:\/(.*))?$/); if(m){const id=m[1],sub=m[2]||''; if(!sub){if(method==='GET'){const x=repository.getProduct(id); if(!x) throw new RepositoryError('NOT_FOUND','product'); return send(res,200,{data:x})}; if(method==='PATCH'){const b=await body(req); const e=b.expectedUpdatedAt; delete b.expectedUpdatedAt; return send(res,200,{data:repository.updateProduct(id,b,e)})}}
    if(sub==='archive'&&method==='POST'){const b=await body(req); return send(res,200,{data:repository.archiveProduct(id,b.expectedUpdatedAt)})}; if(sub==='restore'&&method==='POST'){const b=await body(req); return send(res,200,{data:repository.restoreProduct(id,b.expectedUpdatedAt)})};
    if(sub==='commits'&&method==='GET'){const product=repository.getProduct(id); if(!product) throw new RepositoryError('NOT_FOUND','product'); const n=Number(u.searchParams.get('limit')||5); return send(res,200,{data:await reader(product.repositoryPath,n)})}
    const coll=(name:string, list:any, create:any)=>{if(sub===name&&method==='GET')return send(res,200,{data:list(id)}); if(sub===name&&method==='POST')return body(req).then((b:any)=>send(res,201,{data:create(id,b)}))}
    let r=coll('work-items',repository.listWorkItems,repository.createWorkItem); if(r)return r; r=coll('versions',repository.listVersions,repository.createVersion); if(r)return r; r=coll('documents',repository.listDocuments,(pid:any,b:any)=>repository.createDocument(pid,b)); if(r)return r;
   }
   m=p.match(/^\/api\/(work-items|versions|documents)\/([^/]+)$/); if(m&&method==='PATCH'){const b=await body(req); const e=b.expectedUpdatedAt; delete b.expectedUpdatedAt; const fn=m[1]==='work-items'?repository.updateWorkItem:m[1]==='versions'?repository.updateVersion:repository.updateDocument; return send(res,200,{data:fn(m[2],b,e)})}
   return send(res,404,{error:{code:'NOT_FOUND',message:'Not found'}})
 }catch(e){const x=map(e); return send(res,x.status,x.body)}}
}
