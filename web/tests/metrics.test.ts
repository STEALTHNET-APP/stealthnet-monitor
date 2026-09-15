import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metricSeries } from '../src/data/metrics.ts';
const now = 1800000000000;
const samples = [
 {node_id:'a',time:now-1000,metric:'rx',value:1},
 {node_id:'a',time:now-2000,metric:'rx',value:3},
 {node_id:'b',time:now-3000,metric:'rx',value:5},
 {node_id:'a',time:now-7200000,metric:'rx',value:99},
];
test('fleet rates average per node before summing and filter the time window', () => {
 assert.equal(metricSeries(samples,'rx',1,now)[0][1],7);
 assert.equal(metricSeries(samples,'rx',1,now,'a')[0][1],2);
});
test('resource percentages average nodes and missing intervals remain gaps', () => {
 const rows = samples.map(r=>({...r,metric:'cpu'}));
 assert.equal(metricSeries(rows,'cpu',1,now)[0][1],3.5);
 rows.push({node_id:'a',time:now-600000,metric:'cpu',value:10});
 assert.equal(metricSeries(rows,'cpu',1,now).filter(p=>p[1]===null).length,1);
});
test('five-minute online history forms a continuous series, including zero', () => {
 const rows = [0,1,2].map(i=>({node_id:'a',time:now-i*300000,metric:'users',value:i===0?0:42}));
 assert.equal(metricSeries(rows,'users',1,now).length,3);
 assert.equal(metricSeries(rows,'users',1,now).at(-1)?.[1],0);
 assert.ok(metricSeries(rows,'users',1,now).every(p=>p[1]!==null));
});
