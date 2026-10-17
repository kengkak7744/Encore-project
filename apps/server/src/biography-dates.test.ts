import test from 'node:test';
import assert from 'node:assert/strict';
import {biographyYears,biographyContextYears} from './biography-dates.js';

test('evidenced years survive sentence punctuation without accepting decimals or grouped numbers',()=>{
  assert.deepEqual(biographyYears('runner-up in Miss Universe Thailand 2018, and singles from 2019 onwards.'),[2018,2019]);
  assert.deepEqual(biographyContextYears('ตามบทความปี 2023.'),[2023]);
  assert.deepEqual(biographyYears('ยอด 2018.5 และ 1,2018 ครั้ง'),[]);
});
