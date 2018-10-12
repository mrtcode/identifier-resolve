/*
    ***** BEGIN LICENSE BLOCK *****
    
    Copyright © 2018 Corporation for Digital Scholarship
                     Vienna, Virginia, USA
                     https://www.zotero.org
    
    This file is part of the Zotero Data Server.
    
    Zotero is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.
    
    Zotero is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.
    
    You should have received a copy of the GNU Affero General Public License
    along with Zotero.  If not, see <http://www.gnu.org/licenses/>.
    
    ***** END LICENSE BLOCK *****
*/

const XRegExp = require('xregexp');
const levenshtein = require('fast-levenshtein');
const he = require('he');

module.exports = async function (client, metadata) {
	if (!metadata.title) return {};
	
	let title = metadata.title;
	title = he.decode(title);
	title = title.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, ' $1 ');
	title = title.replace(/<(?:.|\n)*?>/gm, ' ');
	title = title.replace(/[:,.()\[\]]/, ' ');
	
	let authors = [];
	if (metadata.creators) {
		for (let creator of metadata.creators) {
			if (creator.creatorType === 'author') {
				if (creator.firstName) authors.push(creator.firstName);
				if (creator.lastName) authors.push(creator.lastName);
			}
		}
	}
	
	authors = authors.join(' ');
	
	let q = {
		index: 'metadata',
		body: {
			query: {
				match: {
					title: title
				}
			}
		},
		size: 20
	};
	
	let year = null;
	if (metadata.date) {
		let m = metadata.date.match(/[0-9]{4}/);
		if (m) year = m[0];
	}
	
	let res = await client.search(q);
	
	let items = res.hits.hits.map(x => x._source);
	
	let maxSeqLen = 0;
	for (let item of items) {
		if (item.type !== 3) continue;
		item.seqLen = getLongestCommonTextLen(item.title, title);
		if (item.seqLen > maxSeqLen) {
			maxSeqLen = item.seqLen;
		}
		item.namesLen = getCommonWordsLen(item.authors.join(' '), authors);
	}
	
	items = items.filter(x => x.seqLen === maxSeqLen);
	
	let itemsWithYear = items.filter(x => x.year === year);
	
	if (itemsWithYear.length) {
		items = itemsWithYear;
	}
	
	if (items.length === 1) {
		let item = items[0];
		
		if (item.seqLen <= 20) {
		
		}
		else if (item.seqLen <= 35) {
			if (item.namesLen >= 2 && item.year === year) {
				return {DOI: item.DOI};
			}
		}
		else if (item.seqLen <= 45) {
			if (item.namesLen >= 1 && item.year === year || item.namesLen >= 2) {
				return {DOI: item.DOI};
			}
		}
		else if (item.seqLen) {
			if (item.namesLen >= 1 || item.year === year) {
				return {DOI: item.DOI};
			}
		}
	}
	else {
		let maxNamesLen = 0;
		for (let item of items) {
			if (item.namesLen > maxNamesLen) maxNamesLen = item.namesLen;
			items = items.filter(x => x.namesLen === maxNamesLen);
			if (items.length === 1) {
				return {DOI: items[0].DOI}
			}
			else if (items.length <= 5 && maxNamesLen >= 1) {
				items.sort((a, b) => b.count - a.count);
				return {DOI: items[0].DOI}
			}
		}
	}
	
	return {};
};

function normalize(text) {
	let rx = XRegExp('[^\\pL 0-9]', 'g');
	text = XRegExp.replace(text, rx, '');
	text = text.normalize('NFKD');
	text = XRegExp.replace(text, rx, '');
	text = text.toLowerCase();
	return text;
}

function getCommonWordsLen(str1, str2) {
	let commonWords = new Set();
	str1 = str1.replace(/\./g, ' ');
	str2 = str2.replace(/\./g, ' ');
	let words1 = normalize(str1).split(' ').filter(x => x);
	let words2 = normalize(str2).split(' ').filter(x => x);
	
	for (let word of words1) {
		if (word.length < 2) continue;
		if (words2.includes(word)) {
			commonWords.add(word);
		}
	}
	
	return Array.from(commonWords).length;
}

function getLongestCommonTextLen(title1, title2) {
	title1 = normalize(title1).replace(/\s/g, '');
	title2 = normalize(title2).replace(/\s/g, '');
	
	let minLen;
	
	if (title1.length < title2.length) {
		minLen = title1.length;
	}
	else {
		minLen = title2.length;
	}
	
	let matches = [];
	
	for (let n = 1; n <= minLen; n++) {
		let distance = levenshtein.get(title1.slice(0, n), title2.slice(0, n));
		if (distance > n * 0.1) continue;
		matches.push({len: n, distance});
	}
	
	if (!matches.length) return 0;
	
	matches.sort(function (a, b) {
		let k = (b.len - b.distance) - (a.len - a.distance);
		
		if (k === 0) {
			return a.len - b.len;
		}
		
		return k;
	});
	
	return matches[0].len;
}
