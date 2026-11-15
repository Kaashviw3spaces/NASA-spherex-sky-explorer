import test from 'node:test';
import assert from 'node:assert/strict';
import {globeProject,globeUnproject} from '../src/utils/celestialGlobe.js';
test('celestial sphere coordinates round-trip, including RA wrap and polar views',()=>{
  for(const [a,d] of [[0,0],[359,20],[150,89],[24,-89]]) {
    for(const [da,dd] of [[0,0],[.1,.1],[-.1,-.1]]) {
      const ra=(a+da+360)%360,dec=d+dd,p=globeProject(ra,dec,a,d),q=globeUnproject(p.x,p.y,a,d);
      assert.ok(Math.abs(((q.ra-ra+540)%360)-180)<1e-6);
      assert.ok(Math.abs(q.dec-dec)<1e-6);
    }
  }
  assert.equal(globeUnproject(1,1,0,0),null);
  assert.ok(globeProject(180,0,0,0).z<0);
});
