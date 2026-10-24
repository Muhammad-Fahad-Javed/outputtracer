import {describe,it,expect} from 'vitest';
import {fingerprintFiles,compareFingerprints,fingerprintCacheKey} from './similarity';
const source=`#include <iostream>
int main(){int total=0; for(int index=0;index<40;index++){if(index%2==0){total+=index*index;}else{total-=index;} } while(total>100){total/=2;} std::cout<<total;return 0;}`;
describe('similarity evidence',()=>{
 it('tolerates renamed identifiers, formatting and comments while retaining file/line evidence',()=>{
 const a=fingerprintFiles({'main.cpp':source},{},'cpp');const b=fingerprintFiles({'other.cpp':source.replaceAll('total','answer').replaceAll('index','counter').replaceAll(';',';\n// a comment\n')},{},'cpp');expect(a.insufficient).toBe(false);const result=compareFingerprints(a,b);expect(result.score).toBe(100);expect(result.matches[0].right.file).toBe('other.cpp');expect(result.matches.some(m=>m.right.startLine>1)).toBe(true);
 });
 it('reports insufficient original work after excluding starter code',()=>{const a=fingerprintFiles({'main.cpp':source},{'starter.cpp':source},'cpp');expect(a.insufficient).toBe(true);expect(compareFingerprints(a,a).score).toBeNull();});
 it('does not equate different algorithms',()=>{const a=fingerprintFiles({'main.cpp':source},{},'cpp');const b=fingerprintFiles({'main.cpp':'class Node { public: int value; Node *left; Node *right; }; int search(Node* root,int key){if(root==nullptr)return -1;if(root->value==key)return key;return search(root->left,key)+search(root->right,key);}'},{},'cpp');expect(compareFingerprints(a,b).score||0).toBeLessThan(50);});
 it('keys the cache by files, starter, language, and deterministic file order',()=>{expect(fingerprintCacheKey({b:'b',a:'a'},{},'cpp')).toBe(fingerprintCacheKey({a:'a',b:'b'},{},'cpp'));expect(fingerprintCacheKey({a:'a'},{},'cpp')).not.toBe(fingerprintCacheKey({a:'a'},{a:'a'},'cpp'));});
});
