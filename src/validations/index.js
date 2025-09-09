import { AuthUserValidation } from "./authentication/index.js";
import { MaintenanceValidation } from "./maintenance/index.js";


export const validation ={
    authRegiter:AuthUserValidation,
    maintenance:MaintenanceValidation,
}

