Zadání 2: Logistická síť a dodavatelský řetězec -- Supply Chain Network\
Úvod a kontext\
Vytvořte full ‑stack aplikaci Supply Chain Network pro správu
komplexního dodavatelského řetězce. Systém mapuje:\
• Dodavatele, výrobce, distributory a zákazníky\
• Produkty, jejich komponenty a vztahy (BOM -- Bill of Materials)\
• Cesty dopravy a logistické hub\
• Historii objednávek a dostupnosti\
• Detekci rizik a optimalizaci cesty dodávky\
Dodavatelský řetězec je přirozeně grafový -- produkt se skládá z
komponent, komponenty pocházejí od dodavatelů, existují cesty dopravy,
závislosti. Neo4j umožňuje rychle zjistit "co se stane, když vypadne
dodavatel X?" nebo "jakou nejkratší cestu má product Y od zdroje k
zákazníkovi?"\
Datový model\
Entity\
Company (Společnost)\
├── id\
├── name\
├── type (supplier\|manufacturer\|distributor\|retailer\|customer)\
├── country\
├── coordinates (GPS)\
└── reliability (0 --1.0)

Product (Produkt)\
├── id\
├── name\
├── sku\
├── price\
├── weight\
├── leadTime (jak dlouho se vyrábí)\
└── status (active\|discontinued)

Component (Komponenta)\
├── id\
├── name\
├── price\
├── quantity (v BOM)\
└── criticality (low\|medium\|high)

Order (Objednávka)

├── id\
├── orderDate\
├── dueDate\
├── quantity\
├── status (pending\|in_transit\|delivered\|delayed)\
└── cost

Location (Lokace/Hub)\
├── id\
├── name\
├── type (warehouse\|distribution_center\|port)\
├── coordinates\
└── capacity (max storage)

Route (Trasa)\
├── id\
├── name\
├── distance\
├── estimatedTime\
├── cost\
└── reliability (0 --1.0)\
Vztahy\
PRODUCT --\[COMPOSED_OF\] --\> COMPONENT\
Atributy: quantity, position (pořadí v BOM)

COMPONENT --\[SUPPLIED_BY\] --\> COMPANY\
Atributy: price, leadTime, minOrder

COMPANY --\[MANUFACTURES\] --\> PRODUCT\
Atributy: capacity, unitCost, qualityScore (0 --1.0)

COMPANY --\[DISTRIBUTOR_OF\] --\> PRODUCT\
Atributy: stock, lastRestocked

ORDER --\[CONTAINS\] --\> PRODUCT\
Atributy: quantity, unitPrice

ORDER --\[FROM\]--\> COMPANY\
(odkaz na zákazníka)

ORDER --\[PLACED_WITH\] --\> COMPANY\
(odkaz na dodavatele/výrobce)

COMPANY --\[LOCATED_AT\] --\> LOCATION\
Atributy: since

LOCATION --\[CONNECTED_TO\] --\> LOCATION\
(přes trasu)

Atributy: routes: \[ { routeId, distance, time, cost } \]

ORDER --\[SHIPPED_VIA\] --\> ROUTE\
(objednávka se přepravuje touto trasou)\
Atributy: departureDate, arrivalDate

PRODUCT --\[STORED_AT\] --\> LOCATION\
Atributy: quantity, lastRestockDate

COMPANY --\[SUPPLIES\] --\> COMPANY\
(B2B vztah: dodavatel → odběratel)\
Atributy: contractSince, minOrder, leadTime\
REST API -- Klíčové endpointy\
\# Základní CRUD\
GET /api/products, POST /api/products, PUT /api/products/:id, DELETE\
GET /api/companies, POST, PUT, DELETE (dle typu)\
GET /api/orders, POST /api/orders, PUT /api/orders/:id/status

# BOM -- Bill of Materials

GET /api/products/:id/bom\
-- seznam komponent (tree struktura)\
-- včetně cen a dodavatelů

GET /api/products/:id/bom/detailed\
-- rozšířená BOM s historií cen, alternativními dodavateli

POST /api/products/:id/bom\
-- přidání komponenty do produktu

PUT /api/products/:id/bom/:componentI d -- aktualizace množství
komponenty

# Supply Chain -- optimalizace a logistika

GET /api/orders/:orderId/supply -path\
-- cesta objednávky od zdroje k zákazníkovi\
-- formát: \[ { stage, company, location, dueDate, status } \]

GET /api/routes/optimal?from=LOC_A&to=LOC_B&weight=TONS\
-- hledání nejoptimálnější trasy (času, ceny, či kombinace)\
-- vrací: \[ { route, distance, time, cost, reliability } \]

GET /api/companies/:id/risk -assessment\
-- analýza rizik pro daného dodavatele\
-- metriky: reliability scor e, deliveryOnTime %, alternatives

GET /api/analytics/supply -chain-health\
-- celkový stav dodavatelského řetězce

-- vrací: {\
criticalComponents: \[...\],\
bottlenecks: \[...\],\
highRiskSuppliers: \[...\],\
recommendations: \[...\]\
}

GET /api/products/:id/alternative -suppliers\
-- seznam alternativních dodavatelů pro komponentu\
-- seřazeno dle ceny, spolehlivosti, lead time

GET /api/analytics/impact -analysis?supplier=COMPANY_ID\
-- "co se stane, když vypadne dodavatel X?"\
-- vrací seznam ovlivněných produktů a objednávek

GET /api/locations/:id/inventory -status\
-- stav zásob v lokaci\
-- formát: { location, products: \[ { product, qty, daysOfSupply } \] }

GET /api/analytics/cost -breakdown/:orderId\
-- rozpad nákladů objednávky\
-- včetně logistiky, výroby, materiálu

# Predikce

GET /api/analytics/forecast -delays?months=3\
-- prognóza zpoždění v příštích 3 měsících\
-- na základě historických dat a reliability skóre

GET /api/analytics/stock -levels?product=PRODUCT_ID&horizon=months=6\
-- prognóza skladových hladin (6 měsíců dopředu)\
Příklady odpovědí\
Supply Path objednávky\
{ "orderId" : "order-2024-00532", "product" : "Laptop CPU" , "quantity"
: 100, "totalCost" : 45000, "path": \[ { "stage": 1, "name": "Výroba" ,
"company" : { "id": "c-001", "name": "Intel Taiwan" , "reliability" :
0.98 }, "location" : { "id": "loc-tw-01", "name": "Taiwan Fab" ,
"country" : "Taiw an" }, "dueDate" : "2024-02-15", "status" :
"completed" , \], "totalDuration" : "12 days" , "riskFactors" :
\["Weather delays on sea route possible" \] } Risk Assessment
dodavatele\
{ "supplierId" : "c-supplier -05", "company" : "ChipCo Vietnam" ,
"riskScore" : 0.72, "factors" : { "reliabilityScore" : 0.88,
"onTimeDeliveryRate" : 0.92, "qualityIssues" : 0.05, "geopoliticalRisk"
: 0.8, "financialStability" : 0.85\
}, "criticalFor" : \[ { "product" : "Laptop CPU" , "impact" : "high",
"alternatives" : 2 }, { "product" : "RAM Module" , "impact" : "medium" ,
"alternatives" : 4 } \], "recommendations" : \[ "Zvýšit bezpečnostní
zásoby o 20%" , "Vyjednat smlouvu s alternativním dodavatelem ChipCo
Japan" , "Sledovat geopolitické napětí v regionu"\
\] }

Impact Analysis -- Výpadek dodavatele\
{ "supplierId" : "c-supplier -05", "supplierName" : "ChipCo Vietnam" ,
"scenarioName" : "Dodavatel vypadne na 30 dní" , "impact" : {
"affectedProducts" : \[ { "productId" : "prod-laptop-001", "productName"
: "Laptop Model X" , "affectedOrders" : 150, "delayDays" : 28,
"alternativeSupplyTime" : 45 } \], "estimatedCost" : 2500000,
"affectedRevenue" : 5000000, "timeline" : "2024-03-15 to 2024 -04-14",
"mitigation" : \[ "Switch to ChipCo Japan (lead time +7 days)" , "Use
safety stock (covers 15 days)" , "Ramp up alternative supplier Qualcomm
(lead time +14 days)"\
\] } } Frontend -- Klíčové stránky\
1. Přehled produktů (/products ) o Katalog s vyhledáváním a filtry\
   o Tabulka s BOM možností rozbalit\
2. Detail produktu (/products/:id ) o BOM (tree struktura s cenami)\
   o Dodavatelé a alternativy\
   o Historie cen (chart)\
   o Skladové úrovně (graf)\
3. Dodavatelé (/suppliers ) o Tabulka s reliability skóre\
   o Filtr: typ, země, hodnocení\
   o Detail → metriky, produkty, rizika\
4. Objednávky (/orders ) o Filtr: stav, zákazník, produkt\
   o Detail objednávky → Supply Path (interaktivní graf)\
   o Mapa s trasami (leaflet.js)\
5. Supply Chain Health (/analytics/health )

o Dashboard s KPI (na čas, cena, kvalita)\
o Kritické komponenty a dodavatelé\
o Úzká místa (bottlenecks)\
o Doporučení\
6. Risk & Scenario (/analytics/scenarios ) o Vybrat dodavatele\
   o Spustit analýzu výpadku (impact analysis)\
   o Zobrazit doporučení a alternativy