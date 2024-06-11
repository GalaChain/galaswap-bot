/** Used by Brand to mark a type in a readable way. */
// tslint:disable-next-line:interface-over-type-literal
export type Branding<BrandT> = {
  _type: BrandT;
};
/** Create a "flavored" version of a type. TypeScript will disallow mixing flavors, but will allow unflavored values of that type to be passed in where a flavored version is expected. This is a less restrictive form of branding. */
// tslint:disable-next-line:interface-over-type-literal
export type Brand<T, BrandT> = T & Branding<BrandT>;
