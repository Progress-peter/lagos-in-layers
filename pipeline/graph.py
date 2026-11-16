import json
L=json.load(open('/home/claude/v2/data/layers.json'))['layers']
items={it['name']:it for l in L for it in l['items']}
def B(n): return n
E=[ # (entity, kind, years, building item name, line, source url)
("Oba Gabaro","person","1669–1760","Iga Idunganran","The first palace was built for him in 1670.","https://en.wikipedia.org/wiki/Iga_Idunganran"),
("Abubakar Tafawa Balewa","person","1912–1966","Iga Idunganran","Commissioned the modern palace on 1 October 1960.","https://en.wikipedia.org/wiki/Iga_Idunganran"),
("Independence, 1960","event","1960","Iga Idunganran","The modern palace was commissioned on Independence Day.","https://en.wikipedia.org/wiki/Iga_Idunganran"),
("Independence, 1960","event","1960","Independence House","A tower given by the British government for independence.","https://en.wikipedia.org/wiki/Independence_House"),
("End SARS protests","event","2020","Iga Idunganran","The palace was looted during the protests.","https://en.wikipedia.org/wiki/Iga_Idunganran"),
("Bagan Benjamin","architect","","Cathedral Church of Christ, Marina","Designed the Norman Gothic cathedral, built 1924–1946.","https://en.wikipedia.org/wiki/Cathedral_Church_of_Christ,_Lagos"),
("Samuel Ajayi Crowther","person","c. 1809–1891","Cathedral Church of Christ, Marina","His relics were moved to the cathedral in 1976.","https://en.wikipedia.org/wiki/Cathedral_Church_of_Christ,_Lagos"),
("Prince of Wales","person","1894–1972","Cathedral Church of Christ, Marina","Laid the foundation stone on 21 April 1925.","https://en.wikipedia.org/wiki/Cathedral_Church_of_Christ,_Lagos"),
("Lagos Colony","organisation","1862–1906","Freedom Park","Broad Street Prison was set up after Britain took Lagos in 1861.","https://en.wikipedia.org/wiki/Freedom_Park_(Lagos)"),
("Theo Lawson","architect","","Freedom Park","Designed the park on the former prison site.","https://en.wikipedia.org/wiki/Freedom_Park_(Lagos)"),
("Gilbert Carter","person","Governor 1891–1898","Carter Bridge","The first bridge to the mainland, opened 1901, carries his name.","https://en.wikipedia.org/wiki/History_of_Lagos"),
("Lagos–Ibadan railway","organisation","1896–1901","Iddo Terminus","Southern end of the line, opened 4 March 1901.","https://en.wikipedia.org/wiki/History_of_Lagos"),
("The Agudas","organisation","late 1800s","Campos Square","Yoruba returnees from Brazil settled around the square.","https://www.discoverlagos.ng/post/a-walk-through-history-discovering-the-brazilian-quarters-on-lagos-island"),
("The Agudas","organisation","late 1800s","Holy Cross Cathedral","A religious anchor of the returnee community.","https://www.discoverlagos.ng/post/a-walk-through-history-discovering-the-brazilian-quarters-on-lagos-island"),
("The Agudas","organisation","late 1800s","Shitta-Bey Mosque (approximate pin)","Built in the Afro-Brazilian style of the returnees.","https://en.wikipedia.org/wiki/Shitta-Bey_Mosque"),
("João Baptista da Costa","architect","","Shitta-Bey Mosque (approximate pin)","Designed the mosque, completed in 1892.","https://en.wikipedia.org/wiki/Shitta-Bey_Mosque"),
("Mohammed Shitta Bey","person","","Shitta-Bey Mosque (approximate pin)","Financed the mosque and received the title Bey at its opening in 1894.","https://en.wikipedia.org/wiki/Shitta-Bey_Mosque"),
("Seriki Williams Abass","person","","Seriki Williams Abass Slave Museum","His former barracoon, where up to 40 people were held per cell.","https://en.wikipedia.org/wiki/Badagry"),
("Atlantic slave trade","event","1736–1860s","Seriki Williams Abass Slave Museum","Badagry's trade peaked between 1736 and 1789.","https://en.wikipedia.org/wiki/Badagry"),
("Atlantic slave trade","event","1736–1860s","Point of No Return, Gberefu (approximate pin)","The last point before the ships.","https://en.wikipedia.org/wiki/Badagry"),
("Church Missionary Society","organisation","","First Storey Building in Nigeria","Its missionaries built the house in 1842–1845.","https://en.wikipedia.org/wiki/First_Storey_Building_in_Nigeria"),
("British government","organisation","","Independence House","Commissioned the 25-storey tower as an independence gift.","https://en.wikipedia.org/wiki/Independence_House"),
("All-Africa Games, 1973","event","1973","National Stadium, Surulere","The stadium was the main venue.","https://en.wikipedia.org/wiki/National_Stadium,_Lagos"),
("Africa Cup of Nations, 1980","event","1980","National Stadium, Surulere","85,000 watched Nigeria beat Algeria 3–0 in the final.","https://en.wikipedia.org/wiki/National_Stadium,_Lagos"),
("FESTAC '77","event","1977","National Theatre, Iganmu","The theatre was finished in 1976 for the festival.","https://en.wikipedia.org/wiki/National_Theatre,_Nigeria"),
("Techno Exportstroy","organisation","","National Theatre, Iganmu","The Bulgarian firm designed and built it on the plan of Varna's Palace of Culture.","https://en.wikipedia.org/wiki/National_Theatre,_Nigeria"),
("Wole Soyinka","person","b. 1934","National Theatre, Iganmu","Rededicated in his name in 2025.","https://en.wikipedia.org/wiki/National_Theatre,_Nigeria"),
("Fela Kuti","person","1938–1997","Kalakuta Museum","Rebuilt his home here after 1977 and lived here until 1997.","https://felakuti.com/legacy/kalakuta-museum"),
("Fela Kuti","person","1938–1997","New Afrika Shrine","Successor to the Afrika Shrine he founded in 1970.","https://en.wikipedia.org/wiki/New_Afrika_Shrine"),
("Kalakuta raid, 1977","event","1977","Kalakuta Museum","Soldiers burned the first Kalakuta Republic in Surulere on 18 February 1977.","https://felakuti.com/legacy/kalakuta-museum"),
("Kalakuta raid, 1977","event","1977","New Afrika Shrine","The original Shrine burned in 1977.","https://en.wikipedia.org/wiki/New_Afrika_Shrine"),
("Femi Kuti","person","","New Afrika Shrine","Runs the Shrine with Yeni Kuti.","https://en.wikipedia.org/wiki/New_Afrika_Shrine"),
("Yeni Kuti","person","","New Afrika Shrine","Runs the Shrine with Femi Kuti.","https://en.wikipedia.org/wiki/New_Afrika_Shrine"),
("Felabration","event","yearly","New Afrika Shrine","The festival's home venue.","https://en.wikipedia.org/wiki/New_Afrika_Shrine"),
("Makoko demolitions, 2012","event","2012","Makoko","Stilt houses were pulled down; nearly 3,000 people lost their homes.","https://en.wikipedia.org/wiki/Makoko"),
("Babatunde Fashola","person","Governor 2007–2015","Makoko","Ordered the 2012 removal of stilt houses.","https://en.wikipedia.org/wiki/Makoko"),
("Shehu Shagari","person","","Third Mainland Bridge","Commissioned phase one in 1980.","https://en.wikipedia.org/wiki/Third_Mainland_Bridge"),
("Ibrahim Babangida","person","","Third Mainland Bridge","Completed the bridge in 1990.","https://en.wikipedia.org/wiki/Third_Mainland_Bridge"),
("Julius Berger","organisation","","Third Mainland Bridge","Built phase two, Ebute-Metta to Oworonshoki.","https://en.wikipedia.org/wiki/Third_Mainland_Bridge"),
("Nigerian Conservation Foundation","organisation","","Lekki Conservation Centre","Founded the reserve in 1990.","https://www.atlasobscura.com/places/lekki-conservation-center-canopy-walkway"),
("South Energyx Nigeria","organisation","","Eko Atlantic","Developer of the new district, with the Lagos State Government.","https://en.wikipedia.org/wiki/Eko_Atlantic"),
("China Communications Construction","organisation","","Eko Atlantic","Contractor for the sand-filling and sea wall.","https://en.wikipedia.org/wiki/Eko_Atlantic"),
("Lagos State Government","organisation","","Eko Atlantic","Strategic partner in the reclamation.","https://en.wikipedia.org/wiki/Eko_Atlantic"),
("Lagos State Government","organisation","","Makoko","Ordered the 2012 demolitions.","https://en.wikipedia.org/wiki/Makoko"),
("Muhammadu Buhari","person","","Lekki Deep Sea Port","Inaugurated the port on 22 January 2023.","https://en.wikipedia.org/wiki/Port_at_Lekki"),
("Lagos Free Zone","organisation","","Lekki Deep Sea Port","The port sits inside the zone.","https://en.wikipedia.org/wiki/Port_at_Lekki"),
("Lagos Free Zone","organisation","","Dangote Refinery","The refinery sits in the Lekki Free Zone.","https://en.wikipedia.org/wiki/Dangote_refinery"),
]
kinds={'person':'People','architect':'Architects and builders','event':'Events','organisation':'Organisations'}
nodes={}; links=[]
for e,k,yrs,b,line,src in E:
    if b not in items: print('missing',b); continue
    nodes.setdefault(e,dict(id=e,kind=k,years=yrs))
    it=items[b]; bid='B:'+b
    nodes.setdefault(bid,dict(id=bid,kind='building',name=b.replace(' (approximate pin)',''),gid=it['gid'],x=it['x'],z=it['z'],year=it['year']))
    links.append(dict(source=e,target=bid,text=line,src=src))
json.dump(dict(kinds=kinds,nodes=list(nodes.values()),links=links),open('/home/claude/v2/data/graph.json','w'),ensure_ascii=False,separators=(',',':'))
from collections import Counter; print(Counter(n['kind'] for n in nodes.values()), len(links))
