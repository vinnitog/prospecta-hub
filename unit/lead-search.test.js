import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQuery, brazilianPhone, createLeadSearch, parseSearchResults, searchAndImport, SEARCH_ENDPOINT, CITY_ENDPOINT } from '../public/lead-search.js';
import { createBrowserApi } from '../public/browser-store.js';
import { Store } from '../src/store.js';

const filters = { city:'Marília', state:'SP', segments:['hardware','parts','agro','pet','packaging'] };
const area = { type:'area', id:3600000001, tags:{name:'Marília',admin_level:'8','IBGE:GEOCODIGO':'3529005'} };
const item = (id, tags={}) => ({ type:'node',id,tags:{name:`Empresa fictícia ${id}`,shop:'hardware',phone:'(14) 99999-0001',...tags} });
const payload = elements => ({elements:[area,...elements]});
const reply = data => new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
function browserApi() {
  let data = null;
  return createBrowserApi({storage:{getItem:()=>data,setItem:(_,s)=>{data=s;}},locks:{request:(_,fn)=>fn()}});
}

test('consulta é restrita à cidade/UF e aos segmentos permitidos, sem injeção', () => {
  const query = buildQuery(filters,3529005);
  assert.match(query,/IBGE:GEOCODIGO/); assert.match(query,/3529005/); assert.match(query,/car_parts/);
  assert.throws(()=>buildQuery({...filters,city:'X"];out;'}),/cidade/);
  assert.throws(()=>buildQuery({...filters,state:'XX'}),/UF/);
  assert.throws(()=>buildQuery({...filters,segments:['restaurant']}),/segmento/);
  assert.equal(buildQuery({...filters,city:'Marilia'},3529005),query);
});
test('telefones brasileiros preservam DDD e nono dígito, sem inventar contatos', () => {
  assert.equal(brazilianPhone('(14) 3456-0001'),'551434560001');
  assert.equal(brazilianPhone('+55 (14) 99999-0001'),'5514999990001');
  assert.equal(brazilianPhone('0055 14 99999-0001'),'5514999990001');
  assert.equal(brazilianPhone('3456-0001'),null);
  assert.equal(brazilianPhone('+1 213 456 7890'),null);
  assert.equal(brazilianPhone('não divulgado'),null);
  assert.equal(brazilianPhone('inválido; (14) 3456-0001'),'551434560001');
});
test('seleção importa perfil comercial, descarta sem telefone/fechados e mantém procedência', () => {
  const result = parseSearchResults(payload([
    item(1),item(2),item(3,{shop:'restaurant',phone:'(14) 99999-0002'}),
    item(4,{shop:'pet',phone:undefined}),item(5,{shop:'car_parts',phone:'(14) 99999-0003',optIn:true}),
    item(6,{shop:'vacant',name:'Ferragens fictícias',phone:'(14) 99999-0004'}),
    item(7,{shop:'yes',name:'Embalagens fictícias',phone:'(14) 99999-0005'}),
  ]),filters);
  assert.equal(result.leads.length,3); assert.equal(result.withoutPhone,1); assert.equal(result.duplicates,1);
  assert.ok(result.leads.every(l=>!l.optIn && l.stage==='Não contatado' && !l.botActive));
  assert.match(result.leads[0].source,/^https:\/\/www.openstreetmap.org\/node\/\d+$/);
  assert.match(result.leads[0].notes,/Score preliminar/);
  assert.throws(()=>parseSearchResults({remark:'timeout',elements:[area,item(1)]},filters),/não concluiu/);
  assert.throws(()=>parseSearchResults({elements:[]},filters),/Cidade não encontrada/);
});
test('transporte não recebe carteira, usa cache, limita consultas e não repete falhas', async () => {
  let calls=0; let time=100000;
  const search=createLeadSearch({now:()=>time,fetchImpl:async(url,options)=>{
    if (url.startsWith(CITY_ENDPOINT)) { assert.equal(url,`${CITY_ENDPOINT}SP/municipios`); return reply([{id:3529005,nome:'Marília'}]); }
    calls++; assert.equal(url,SEARCH_ENDPOINT); assert.equal(options.credentials,'omit');
    assert.deepEqual([...options.body.keys()],['data']); assert.equal(options.body.get('data'),buildQuery(filters,3529005));
    return reply(payload([item(1)]));
  }});
  await search(filters); const cached=await search(filters); cached.leads[0].notes='modificado';
  assert.notEqual((await search(filters)).leads[0].notes,'modificado'); assert.equal(calls,1);
  await assert.rejects(search({...filters,city:'Outra cidade'}),/Aguarde/);
  time+=300001; await search(filters); assert.equal(calls,2);
  let failures=0; const limited=createLeadSearch({fetchImpl:async(url)=>{if(url.startsWith(CITY_ENDPOINT)) return reply([{id:3529005,nome:'Marília'}]); failures++;return new Response('',{status:429});}});
  await assert.rejects(limited(filters),/limitou/); await assert.rejects(limited(filters),/Aguarde/); assert.equal(failures,1);
});
test('busca + importação usa persistência real do navegador sem sobrescrever notas ou opt-out', async () => {
  const api=browserApi(); const leads=parseSearchResults(payload([item(1),item(2,{phone:'(14) 99999-0002'})]),filters);
  await api('/api/leads',{method:'POST',body:JSON.stringify({...leads.leads[0],notes:'Nota privada preservada',doNotContact:true})});
  const result=await searchAndImport(async()=>leads,api,filters);
  assert.equal(result.imported,1); assert.equal(result.skipped,1);
  const state=await api('/api/state'); assert.equal(state.leads.length,2);
  assert.equal(state.leads.find(l=>l.phone==='5514999990001').notes,'Nota privada preservada');
  assert.equal(state.leads.find(l=>l.phone==='5514999990001').doNotContact,true);
  assert.equal((await searchAndImport(async()=>leads,api,filters)).imported,0);
});
test('lotes seguintes avançam além dos primeiros 50 e importam no SQLite também', async t => {
  const store=new Store(); t.after(()=>store.close());
  const result=parseSearchResults(payload(Array.from({length:55},(_,i)=>item(i+1,{phone:`551499999${String(i).padStart(4,'0')}`}))),filters);
  const api=async(url,options)=>url==='/api/state'?{leads:store.list()}:store.import(JSON.parse(options.body));
  const first=await searchAndImport(async()=>result,api,filters); assert.equal(first.imported,50);assert.equal(first.remaining,5);
  const next=await searchAndImport(async()=>result,api,filters); assert.equal(next.imported,5); assert.equal(next.skipped,50);
  assert.equal(store.list().length,55);
});
test('cancelamento e falha da fonte não importam resultados parciais', async () => {
  const api=browserApi(); const controller=new AbortController(); controller.abort();
  await assert.rejects(searchAndImport(async()=>parseSearchResults(payload([item(1)]),filters),api,filters,{signal:controller.signal}),/cancelada/);
  const search=createLeadSearch({fetchImpl:async(url)=>reply(url.startsWith(CITY_ENDPOINT)?[{id:3529005,nome:'Marília'}]:{remark:'timeout',elements:[area,item(1)]})});
  await assert.rejects(searchAndImport(search,api,filters),/não concluiu/);
  assert.equal((await api('/api/state')).leads.length,0);
});
test('cidade inexistente ou erro no IBGE impede consulta e importação', async () => {
  let calls=0;
  const search=createLeadSearch({fetchImpl:async(url)=>{calls++;assert.ok(url.startsWith(CITY_ENDPOINT));return reply([{id:1234567,nome:'Município fictício'}]);}});
  const api=browserApi();
  await assert.rejects(searchAndImport(search,api,filters),/Cidade não encontrada/);
  assert.equal(calls,1); assert.equal((await api('/api/state')).leads.length,0);
  const unavailable=createLeadSearch({fetchImpl:async()=>new Response('',{status:503})});
  await assert.rejects(unavailable(filters),/municípios está indisponível/);
  assert.throws(()=>buildQuery(filters,'1";out;'),/Identificador/);
});
