import Joi from "joi";

const maintainSchema = Joi.object({
    full_name: Joi.string().min(4).required().messages({
        "string.base": `"full_name" should be a type of "string"`,
        "string.empty": `"full_name" cannot be an empty field`,
        "string.min": `"full_name" should have a minimum length of {#limit}`,
        "any.required": `"full_name" is a required field`,
    }),

   category:Joi.string().required().messages({
        "string.base":`"category" should be a type of string`,
        "any.required":`"category" is required field`,
   }),
   unitId:Joi.string().required().messages({
        "string.base":`"unitId" should be a objectId`,
        "any.required":`"unitId" is required field`
   }),
   scheduled:Joi.string().required().messages({
        "string.base":`"scheduled" should be a date`,
        "any.required":`"scheduled" is required field`,
   }),
   title:Joi.string().required().messages({
        "string.base":`"title" should be a type of string`,
        "any.required":`"title" is required field`,
   }),
   description:Joi.string().min(6).required().messages({
        "string.base":`"description" should be a type of string`,
        "any.required":`"description" is required field`,
        "string.min": `"description" should have a minimum length of {#limit}`,
   }),
   estmate_cost:Joi.number().required().messages({
        "number.base":`"estmate_cost" should be a type of Number`,
        "any.required":`"estmate_cost" is required field`,
   }),
   status:Joi.string().optional(),
});

export const MaintenanceValidation = (data)=>{
     const {value,error} = maintainSchema.validate(data,{abortEarly:false})
    if (error) {
        throw new Error(error.details.map((detail)=>detail.message).join(","))
    }
    return value
}