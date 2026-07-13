import path from 'node:path'
import type {Plugin} from 'vite'
import {createSqliteRepository} from './sqlite.js'
import {createApiHandler} from './api.js'
import {readGitLog} from './gitLog.js'
export function createViteApiPlugin({databasePath,gitReader}:{databasePath?:string;gitReader?:typeof readGitLog}={}):Plugin {
 let repo:any
 return {name:'vibe-studio-api',configureServer(server){const file=databasePath??path.resolve(process.cwd(),'data/vibe-studio.sqlite'); repo=createSqliteRepository(file); const handler=createApiHandler({repository:repo,readGitLog:gitReader}); server.middlewares.use('/api',(req,res)=>handler(req,res)); server.httpServer?.once('close',()=>repo?.close())}}
}
