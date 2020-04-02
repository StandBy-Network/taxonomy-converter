const superagent = require('superagent');
const csv = require('csv-parse/lib/sync');
const fs = require('fs');

const taxoSrc = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRWlWrDU4ZBiHPmMDVGBEsBkDi4mNt4EDV46Rd1Sof4h7hDB47xds09oYt8jsKw6lj5Ayy9KsXzFzHU/pub?gid=76864909&single=true&output=csv';

const makei18n = (row) => {
  const langs = Object.keys(row).filter(fname =>
    fname.substring(0,5) === 'lang_' && fname.substring(fname.length-6) !== '_synon'
  ).map(fname => fname.substring(5));
  const out = {
    "name":{},
    "synonyms":{}
  };
  langs.forEach(lang => {
    out.name[lang] = row[`lang_${lang}`];
    out.synonyms[lang] = [];
    if (row[`lang_${lang}_synon`]) {
      out.synonyms[lang] = row[`lang_${lang}_synon`].split(',').map(item => item.trim());
    }
  });
  if (out.synonyms === {}) {
    delete out.synonyms;
  }
  return out;
};

superagent
  .get(taxoSrc)
  .end((err, data) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    if (!data.res || !data.res.text) {
      console.error('Reply is not right', data);
    } else {
      const taxoRaw = csv(data.res.text,{columns: true,trim:true,skip_empty_lines:true,skip_lines_with_empty_values:true});
      const taxoDone = {};
      let currentPropContext = null;
      let currentPropName = null;
      taxoRaw.forEach(item => {
        if (item.type==='cat') {
          if (taxoDone[item.key] === undefined) {
            taxoDone[item.key] = makei18n(item);
            taxoDone[item.key].parent = item.parent;
            taxoDone[item.key].props = {};
          }
        }
        else if (item.type === 'prop') {
          if (taxoDone[item.parent]) {
            taxoDone[item.parent].props[item.key] = makei18n(item);
            taxoDone[item.parent].props[item.key].type = 'text';
            taxoDone[item.parent].props[item.key].required = false;
            taxoDone[item.parent].props[item.key].range = [null, null];
            taxoDone[item.parent].props[item.key].values = {};
          }
          currentPropContext = taxoDone[item.parent].props[item.key];
          currentPropName = item.key;
        }
        else if (item.type === 'propdef') {
          if (currentPropContext !== null && item.parent === currentPropName) {
            if (item.key.substring(0,1) === '!') {
              currentPropContext.required = true;
              item.key = item.key.substring(1);
            }
            currentPropContext.type = item.key;
          }
        }
        else if (item.type === 'propval') {
          if (currentPropContext !== null && item.parent === currentPropName) {
            currentPropContext.values[item.key] = makei18n(item);
          }
        }
        else if (item.type === 'proprange') {
          if (currentPropContext !== null && item.parent === currentPropName) {
            currentPropContext.range = item.key.split(':');
          }
        }
        else if (item.type === 'proprequired') {
          if (currentPropContext !== null && item.parent === currentPropName) {
            currentPropContext.required = ['true','yes','y','require','required'].includes(item.key.toLowerCase());
          }
        }
      });
      const JSONout = JSON.stringify(taxoDone);
      console.log(JSONout);
    }
  });
