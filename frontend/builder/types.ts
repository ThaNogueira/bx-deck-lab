export interface Part {
  id: string; display: string; name: string; kind: string; abbrev?: string;
  wiki?: string; image?: string; banned?: boolean; basicLock?: boolean; requiresOver?: boolean;
}
export interface Analysis {
  type: string; sentence: string; atk: number; def: number; sta: number;
  bitNote: string; ratchetNote: string; assistNote?: string;
}
export interface SlotView {
  mode: string; index: number; invalid: string[]; complete: boolean;
  name: string; filled: number; total: number; expand: boolean;
  tip?: { label: string; note: string };
  analysis: Analysis | null;
  fields: {field: string; kind: string; label: string; part?: Part; problems: string[]; targeted: boolean}[];
}
export type ResolveImage = (id: string) => Promise<string | null>;
export interface CardsView { slots: SlotView[]; modes: Record<string,string>; resolveImage: ResolveImage }
export interface PickerView { items: {part: Part; owned: number; favorite: boolean; title: string}[]; resolveImage: ResolveImage }
export interface BuilderUI {
  cards(data: CardsView): void;
  picker(data: PickerView): void;
  filters(kinds: string[][], current: string): void;
  sheet(data: SheetView): void;
  analysis(data: DeckAnalysis, complete: number): void;
  validation(data: Validation): void;
}
export interface Validation { legal:boolean; errors:string[]; info:string[]; complete:number }
export interface DeckAnalysis { title:string; text:string; tone:string; atk?:number; def?:number; sta?:number; special?:string[] }
export interface Recommendation { p: Part; reason: string; tags: string[] }
export interface SheetItem { p: Part; owned: number; disabled: boolean; why: string; current: boolean; favorite: boolean; rec?: Recommendation }
export interface SheetView { items: SheetItem[]; favorites: SheetItem[]; recent: SheetItem[]; recommendations: Recommendation[]; showAll: boolean; resolveImage: ResolveImage }
declare global { interface Window { BXBuilderUI: BuilderUI } }
