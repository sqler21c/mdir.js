import { Reader, ProgressFunc, IMountList } from "../../common/Reader";
import { File, FileLink } from "../../common/File";
import { Logger } from "../../common/Logger";
import { ArchiveCommon } from "./ArchiveCommon";
import { ArchiveTarGz } from "./ArchiveTarGz";
import { ArchiveZip } from "./ArchiveZip";
import * as path from "path";

const log = Logger("Archive");

export class ArchiveReader extends Reader {
    private baseArchiveFile: File;
    private archiveObj: ArchiveCommon = null;
    private archiveFiles: File[] = [];
    private baseDir: File;
    protected _readerFsType = "archive";

    async setArchiveFile( file: File, progressFunc: ProgressFunc ): Promise<boolean> {
        let archiveObjs = [ new ArchiveTarGz(), new ArchiveZip() ];
        this.archiveObj = archiveObjs.find( item => item.setFile( file ) );
        if ( !this.archiveObj ) {
            return false;
        }
        this.baseArchiveFile = file;
        log.info( "Archive Type: [%s] [%s]", file.name, this.archiveObj.getSupportType());
        this.archiveFiles = await this.archiveObj.getArchivedFiles(progressFunc);
        this.baseDir = this.rootDir();
        return true;
    }

    convertFile(path: string, option?: any): File {
        if ( !path ) {
            return null;
        } else if ( path === "." ) {
            return this.baseDir;
        } else if ( path === ".." ) {
            let file = this.rootDir();
            if ( this.baseDir.fullname !== this.sep() && this.baseDir.dirname !== this.sep() ) {
                file = this.convertFile(this.baseDir.dirname + this.sep());
            } else {
                file = this.rootDir();
            }
            file.name = "..";
            return file;
        } else if ( path === this.sep() ) {
            return this.rootDir();
        }
        return this.archiveFiles.find( (item) => {
            return item.fullname === path;
        }).clone();
    }

    readdir(dir: File, option ?: { isExcludeHiddenFile ?: boolean, noChangeDir ?: boolean }): Promise<File[]> {
        let resultFile = [];
        if ( dir.fstype === "archive" ) {
            resultFile = this.archiveFiles.filter( (item) => {
                if ( dir.fullname === item.fullname ) {
                    return false;
                }
                if ( item.fullname.startsWith(dir.fullname) ) {
                    let idx = item.fullname.indexOf("/", dir.fullname.length);
                    if ( idx === -1 || idx === item.fullname.length - 1) {
                        return true;
                    }
                }
                return false;
            }).map( item => item.clone() );
            this.baseDir = dir.clone();
        }
        return new Promise((resolve) => {
            resolve( resultFile );
        });
    }
 
    homeDir(): File {
        return this.rootDir(); 
    }

    rootDir(): File {
        let file = new File();
        file.fstype = "archive";
        file.fullname = "/";
        file.orgname = "";
        file.name = "/";
        file.owner = "";
        file.group = "";
        file.uid = 0;
        file.gid = 0;
        file.mtime = new Date();
        file.atime = new Date();
        file.ctime = new Date();
        file.root = this.baseArchiveFile.fullname;
        file.attr = "drwxr-xr-x";
        file.size = 0;
        file.dir = true;
        return file;
    }

    mountList(): Promise<IMountList[]> {
        return null;
    }

    changeDir(dirFile: File) {
        throw new Error("Unsupport changedir");
    }

    currentDir(): File {
        return this.baseDir;
    }

    sep(): string {
        return "/";
    }

    exist(source: string | File): boolean {
        if ( !source ) {
            return false;
        }
        return !!this.archiveFiles.find( (item) => {
            if ( source instanceof File ) {
                return item.fullname === source.fullname;
            }
            return item.fullname === source;
        });
    }

    mkdir(pathStr: string | File, progress?: ProgressFunc) {
        let file: File = null;
        if ( typeof(pathStr) === "string" ) {
            file = this.baseDir.clone();
            file.fullname = path.posix.normalize(pathStr) + path.posix.sep;
            file.name = path.posix.basename(file.fullname);
            file.orgname = file.fullname.replace(/^\//, "");
        } else {
            file = pathStr;
        }
        return new Promise( async (resolve, reject) => {
            try {
                await this.archiveObj.compress( [ file ], null, this.baseDir, progress);
                await this.setArchiveFile( this.baseArchiveFile, progress );
                resolve();
            } catch( e ) {
                reject( e );
            }
        });
    }

    rename(source: File, rename: string, progress?: ProgressFunc): Promise<void> {
        return new Promise( async (resolve, reject) => {
            try {
                await this.archiveObj.rename(source, rename, progress);
                await this.setArchiveFile( this.baseArchiveFile, progress );
                resolve();
            } catch( e ) {
                reject( e );
            }
        });
    }

    copy(source: File | File[], sourceBaseDir: File, targetDir: File, progress?: ProgressFunc): Promise<void> {
        if ( Array.isArray( source ) && source.length > 0 && source[0].fstype === "archive" && targetDir.fstype === "file") {
            return this.archiveObj.uncompress(targetDir, source, progress);
        } else if ( Array.isArray( source ) && source.length > 0 && source[0].fstype === "file" && targetDir.fstype === "archive" ) {
            return new Promise( async (resolve, reject) => {
                try {
                    await this.archiveObj.compress(source, sourceBaseDir, targetDir, progress);
                    await this.setArchiveFile( this.baseArchiveFile, progress );
                    resolve();
                } catch( e ) {
                    reject( e );
                }
            });
        }
        return new Promise((resolve, reject) => {
            reject( "Unsupport copy !!!" );
        });
    }

    remove(source: File | File[], progress?: ProgressFunc): Promise<void> {
        return new Promise( async (resolve, reject) => {
            if ( Array.isArray( source ) ) {
                try {
                    await this.archiveObj.remove(source, progress);
                    await this.setArchiveFile( this.baseArchiveFile, progress );
                    resolve();
                } catch( e ) {
                    reject( e );
                }
            } else {
                reject( "only support array source files !!!" );
            }
        });
    }
}
