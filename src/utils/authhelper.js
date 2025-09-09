import { v4 } from "uuid"
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import path from "path"
import fs from "fs"
import { fileURLToPath } from "url"

// const secretKey = crypto.randomBytes(32)
// const iv = crypto.randomBytes(16)
const secretKey = process.env.enc_secret_key
const iv = process.env.enc_iv_key

const algorithm = 'aes-256-cbc'
const dirname = path.dirname(fileURLToPath(import.meta.url))


async function loadKeys() {
    try {
        const jwtPrivateKey =fs.readFileSync(path.join(dirname, '../../private.key'), 'utf8');
        const jwtPublicKey =fs.readFileSync(path.join(dirname, '../../public.key'), 'utf8');
        return { jwtPrivateKey, jwtPublicKey };
    } catch (error) {
        console.log(error)
    }
}
const { jwtPrivateKey, jwtPublicKey } = await loadKeys()

export const JWTEncoded = async(data)=>{
    try { 
        const cipher = crypto.createCipheriv(algorithm,Buffer.from(secretKey,'hex'),Buffer.from(iv,'hex'))
        const token = jwt.sign({uuid:data?.uuid,role:data?.role,email:data?.email,_id:data?._id},jwtPrivateKey,{algorithm:'RS256'})
        let encrypt = cipher.update(token,'utf-8','hex')
        encrypt+=cipher.final('hex')
    
        return {
            iv,
            token:encrypt
        }

    } catch (error) {
        console.log(error)
        throw error
    }
}

export const JWTDecoded = async(data)=>{
    try {    
        const decipher = crypto.createDecipheriv(algorithm,Buffer.from(secretKey,'hex'),Buffer.from(iv,'hex'))
        let decrypt = decipher.update(data,'hex','utf-8')
        decrypt+=decipher.final('utf-8')

        console.log(decrypt)
    
        const token = jwt.verify(decrypt,jwtPublicKey,{algorithms:['RS256']})
        return token
    } catch (error) {
        if (error.message === "jwt expired") {
            return { status: "failed", message: error.message }
        }
        return { status: "failed", message: error.message, data: null }
    }
}


export const GetUUID = async ()=>{
    return v4()
}

export const generateOtp = async()=>{
    const otp = Math.floor(100000 + Math.random() * 900000)
    const token =crypto.randomBytes(5).toString('hex')
    return {otp, token}
}