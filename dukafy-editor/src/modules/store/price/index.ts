import type { ModuleDefinition } from '@core/module-engine'
import { registry } from '@core/module-engine'
import { Value } from '@core/utils/typeboxHelpers'
import { PackageSolidIcon } from 'pixel-art-icons/icons/package-solid'
import { PriceEditor } from './PriceEditor'
import { PricePropsSchema, type PriceProps } from './props'

export const PriceModule:ModuleDefinition<PriceProps>={
  id:'store.price',name:'Price',description:'A product or variant price.',category:'Commerce',version:'1.0.0',icon:PackageSolidIcon,trusted:true,canHaveChildren:false,
  schema:{productSlug:{type:'text',label:'Product slug',placeholder:'everyday-canvas-tote'},variantSku:{type:'text',label:'Variant SKU',description:'Leave blank for the first variant.'},priceCents:{type:'number',label:'Fallback price',min:0,step:1,unit:'cents'},currency:{type:'text',label:'Fallback currency'}},
  propsSchema:PricePropsSchema,defaults:Value.Create(PricePropsSchema),component:PriceEditor,htmlTag:'span',render:()=>({html:''}),
}
registry.registerOrReplace(PriceModule)
