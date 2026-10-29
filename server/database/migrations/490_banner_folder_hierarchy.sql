-- Exact folder names and hierarchy captured from the signed-in TheBrief sidebar on 30 October 2026.
-- 88 roots + 13 nested folders; source is docs/migrations/thebrief-folders-20261030.json.
-- Folder placement never changes client access, artwork, tags or publishing state.
BEGIN;
CREATE TABLE IF NOT EXISTS banner_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  parent_id UUID REFERENCES banner_folders(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL DEFAULT 0,
  source TEXT,
  source_path TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (id IS DISTINCT FROM parent_id),
  UNIQUE (source, source_path)
);
CREATE INDEX IF NOT EXISTS banner_folders_parent_idx ON banner_folders(parent_id);
ALTER TABLE banner_projects ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES banner_folders(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS banner_projects_folder_idx ON banner_projects(folder_id);

INSERT INTO banner_folders (id, name, parent_id, position, source, source_path) VALUES
('0e805d1d-d12e-5086-b797-5607d63ec7aa','ADME',NULL,0,'thebrief:6422:1768984',ARRAY['ADME']),
('aafea9f5-e37c-54ae-ab16-10aed2e8914a','Temporary','0e805d1d-d12e-5086-b797-5607d63ec7aa',1,'thebrief:6422:1768984',ARRAY['ADME','Temporary']),
('365c65ca-fa5e-5831-9048-2922a2fb22ed','AI generated designs',NULL,2,'thebrief:6422:1768984',ARRAY['AI generated designs']),
('9cdc31db-c961-5215-a94d-db614f3ad2fc','Alan Mance',NULL,3,'thebrief:6422:1768984',ARRAY['Alan Mance']),
('6355d49a-cac9-52cc-a11b-7075db4416b6','Alfa Romeo',NULL,4,'thebrief:6422:1768984',ARRAY['Alfa Romeo']),
('cc592c5a-b25f-5f49-9a39-c169daa7df01','Arctic Campers',NULL,5,'thebrief:6422:1768984',ARRAY['Arctic Campers']),
('37d1da32-c68a-5ac2-bc97-b1e0ee7679d0','Audi',NULL,6,'thebrief:6422:1768984',ARRAY['Audi']),
('29ec10b3-0b33-5d2d-b06a-ac604df7eecc','Bay City Auto Group',NULL,7,'thebrief:6422:1768984',ARRAY['Bay City Auto Group']),
('86f4ea9a-7cfa-5b67-ad2a-46ca22dfe582','Blood Motor Group',NULL,8,'thebrief:6422:1768984',ARRAY['Blood Motor Group']),
('9501737d-0db8-5fbf-8c86-ede3b2089629','Boulevard Motors',NULL,9,'thebrief:6422:1768984',ARRAY['Boulevard Motors']),
('91694164-bba7-55cc-b006-cc13f9e77f6d','Brighton Auto Group (Holdings)',NULL,10,'thebrief:6422:1768984',ARRAY['Brighton Auto Group (Holdings)']),
('580cc54e-e0f8-57bc-9bc3-61b02e689d20','Brighton Hyundai',NULL,11,'thebrief:6422:1768984',ARRAY['Brighton Hyundai']),
('32b65bc3-aae4-5b61-92c1-4cba2d53670b','Brighton MG',NULL,12,'thebrief:6422:1768984',ARRAY['Brighton MG']),
('7e46fc14-d88a-5b61-833c-97efca4e220b','Brighton Mitsubishi',NULL,13,'thebrief:6422:1768984',ARRAY['Brighton Mitsubishi']),
('7054f332-b814-5d75-ad4b-0142399db82b','Brighton Ssangyong',NULL,14,'thebrief:6422:1768984',ARRAY['Brighton Ssangyong']),
('7985ab57-5f07-5ba1-83c7-703b3f08e8c9','Caravan Hire Co.',NULL,15,'thebrief:6422:1768984',ARRAY['Caravan Hire Co.']),
('984d6d8e-6b4d-5898-b726-e43cc2837eaa','Chery',NULL,16,'thebrief:6422:1768984',ARRAY['Chery']),
('efccb242-3678-5d4f-9552-eb1a8b17ceb1','Citreon',NULL,17,'thebrief:6422:1768984',ARRAY['Citreon']),
('3bd8cb60-30d9-517a-a759-e9ef5e673795','DEEPAL',NULL,18,'thebrief:6422:1768984',ARRAY['DEEPAL']),
('8b9fa3e3-a31b-5f91-b066-6f479064edf3','DENZA',NULL,19,'thebrief:6422:1768984',ARRAY['DENZA']),
('e0629592-81df-53e6-a230-e02736647b1b','Essential Caravans',NULL,20,'thebrief:6422:1768984',ARRAY['Essential Caravans']),
('c5fc21cc-303e-528f-b700-183fc9e47dd7','Ferntree Gully Automotive',NULL,21,'thebrief:6422:1768984',ARRAY['Ferntree Gully Automotive']),
('8413b42f-2a25-5ab7-ac96-494c7e0c2449','Fiat',NULL,22,'thebrief:6422:1768984',ARRAY['Fiat']),
('8b3c94e2-4197-5705-8520-52f11925774d','FNQ / Brighton Motor Group',NULL,23,'thebrief:6422:1768984',ARRAY['FNQ / Brighton Motor Group']),
('73010041-f1cf-5063-ba31-bc02592b103f','Ford',NULL,24,'thebrief:6422:1768984',ARRAY['Ford']),
('c349e4dd-8ad7-5b8c-b5a3-456feb88e5ca','Forthing',NULL,25,'thebrief:6422:1768984',ARRAY['Forthing']),
('8b791300-a1b8-59f1-a5ec-c132f6d46eec','Foton',NULL,26,'thebrief:6422:1768984',ARRAY['Foton']),
('7a5e6d1c-fb70-5a2f-b53b-be8c6b23c474','GAC',NULL,27,'thebrief:6422:1768984',ARRAY['GAC']),
('4caf216a-71c3-55bd-bd87-e61937370b82','Garry and Warren Smith',NULL,28,'thebrief:6422:1768984',ARRAY['Garry and Warren Smith']),
('eae98ba8-21e5-585a-92cf-1e51ec329a4f','Geely',NULL,29,'thebrief:6422:1768984',ARRAY['Geely']),
('b0d8bb67-0d31-5c0e-8999-4a983eb54f59','Gendore',NULL,30,'thebrief:6422:1768984',ARRAY['Gendore']),
('885fd1ea-a544-5cca-935d-cfb3126bc2fe','Get You Finance',NULL,31,'thebrief:6422:1768984',ARRAY['Get You Finance']),
('ce486215-e137-5b6e-953d-8c84afaab968','Gippsland Motor Group',NULL,32,'thebrief:6422:1768984',ARRAY['Gippsland Motor Group']),
('b0e933e1-8353-51ec-a0df-0d1d1274a97d','GMSV',NULL,33,'thebrief:6422:1768984',ARRAY['GMSV']),
('cf1265d8-458c-57d5-8dea-7d54850c58bd','Google Ads',NULL,34,'thebrief:6422:1768984',ARRAY['Google Ads']),
('a67e8d78-3732-591b-99a7-cbeff5703c8c','Google Demand Gen',NULL,35,'thebrief:6422:1768984',ARRAY['Google Demand Gen']),
('aef53471-8388-5863-a925-778d444a92e2','GWM Haval',NULL,36,'thebrief:6422:1768984',ARRAY['GWM Haval']),
('d982fde7-c3a6-5cf6-ba25-8054673a1340','Heritage Auto Group',NULL,37,'thebrief:6422:1768984',ARRAY['Heritage Auto Group']),
('589e2bce-c973-589a-9b9a-5957456fa52e','Holden',NULL,38,'thebrief:6422:1768984',ARRAY['Holden']),
('13b7a90f-cb97-538b-bc1e-fede2102e227','Honda',NULL,39,'thebrief:6422:1768984',ARRAY['Honda']),
('f3c4b52c-aa50-5b3f-8bab-ce7cb1c16eac','Hyundai',NULL,40,'thebrief:6422:1768984',ARRAY['Hyundai']),
('284f1cf8-0a83-5db9-9208-c89de73dc422','Ineos',NULL,41,'thebrief:6422:1768984',ARRAY['Ineos']),
('1bc80f4e-2b15-5f81-ae9f-a31096f5ecad','Ironman 4x4',NULL,42,'thebrief:6422:1768984',ARRAY['Ironman 4x4']),
('f2bb0a28-449d-58b8-8d29-3a284ff98014','Island Coast',NULL,43,'thebrief:6422:1768984',ARRAY['Island Coast']),
('7ba3b0aa-d6be-5e99-8f54-473752472280','Isuzu UTE',NULL,44,'thebrief:6422:1768984',ARRAY['Isuzu UTE']),
('4c94abaa-4d32-5a8e-af3c-37a2e67b354a','JAC',NULL,45,'thebrief:6422:1768984',ARRAY['JAC']),
('ad63bc9f-2645-50eb-876e-532a2b4bd48e','Jaecoo',NULL,46,'thebrief:6422:1768984',ARRAY['Jaecoo']),
('1899b763-14a5-5d17-b82a-9e685535e555','Jaguar Land Rover',NULL,47,'thebrief:6422:1768984',ARRAY['Jaguar Land Rover']),
('7536349b-4932-5c7b-a93d-a8ba9abac1eb','Jeep',NULL,48,'thebrief:6422:1768984',ARRAY['Jeep']),
('a9742069-249d-5ace-b025-11c179d8ee96','KGM',NULL,49,'thebrief:6422:1768984',ARRAY['KGM']),
('301d7e03-62fb-511d-bf6f-f833f2317575','KIA',NULL,50,'thebrief:6422:1768984',ARRAY['KIA']),
('63fb6424-95e6-52e5-8115-2eaf61f3ef0c','LDV',NULL,51,'thebrief:6422:1768984',ARRAY['LDV']),
('c3759750-40d0-5199-b80c-8dfb4c4f39ca','Leapmotor',NULL,52,'thebrief:6422:1768984',ARRAY['Leapmotor']),
('ce018102-2266-55ae-9026-cd34c9de43bd','Mahindra',NULL,53,'thebrief:6422:1768984',ARRAY['Mahindra']),
('d41f6ea3-387e-5c8d-ba08-08fa19f228b7','Mansfield Motor Group',NULL,54,'thebrief:6422:1768984',ARRAY['Mansfield Motor Group']),
('b95ef052-ad37-5983-b2da-df37098c0372','Mazda',NULL,55,'thebrief:6422:1768984',ARRAY['Mazda']),
('697d2c90-0751-5f5b-9d4c-2eb1555d4321','McRae Motors',NULL,56,'thebrief:6422:1768984',ARRAY['McRae Motors']),
('4537d270-e9a7-55dc-a3d8-de1b471e23bb','Mercedes-Benz',NULL,57,'thebrief:6422:1768984',ARRAY['Mercedes-Benz']),
('aae52751-2e9d-52c5-a62c-fac19604d9d0','MG',NULL,58,'thebrief:6422:1768984',ARRAY['MG']),
('26f2a6b5-07ea-58e3-987d-2f92050a3d93','Mitsubishi',NULL,59,'thebrief:6422:1768984',ARRAY['Mitsubishi']),
('657c029f-00f8-545e-b50f-5f861be92ea3','Mornington Mits & Isuzu Ute',NULL,60,'thebrief:6422:1768984',ARRAY['Mornington Mits & Isuzu Ute']),
('c0648a24-829a-5e05-9754-fbd2ca8d8b60','Mornington Used Car Dealers',NULL,61,'thebrief:6422:1768984',ARRAY['Mornington Used Car Dealers']),
('91a761f5-607b-5aac-9dea-6acb57813716','MotorOne',NULL,62,'thebrief:6422:1768984',ARRAY['MotorOne']),
('6c8e3b65-1b45-5f1b-9751-c90070e98a18','New Age Caravans',NULL,63,'thebrief:6422:1768984',ARRAY['New Age Caravans']),
('c13166da-036f-5445-87d8-ae29a858f7b6','4.99% finance','6c8e3b65-1b45-5f1b-9751-c90070e98a18',64,'thebrief:6422:1768984',ARRAY['New Age Caravans','4.99% finance']),
('97922dd3-635f-5a28-a713-c0492bc05ba4','Organic Social Media','6c8e3b65-1b45-5f1b-9751-c90070e98a18',65,'thebrief:6422:1768984',ARRAY['New Age Caravans','Organic Social Media']),
('d95c1d8d-b4d0-5942-aa21-55f041044f8d','Nissan',NULL,66,'thebrief:6422:1768984',ARRAY['Nissan']),
('6866ebb7-1d2e-52db-8b63-a6eb17d01cd2','Northern Motor Group',NULL,67,'thebrief:6422:1768984',ARRAY['Northern Motor Group']),
('32b2c2a5-9821-560b-970e-ce7f571743fe','Performance Max',NULL,68,'thebrief:6422:1768984',ARRAY['Performance Max']),
('8a2c7018-51b4-5b1d-94a4-0f644ede3013','PMAX (Google etc)','32b2c2a5-9821-560b-970e-ce7f571743fe',69,'thebrief:6422:1768984',ARRAY['Performance Max','PMAX (Google etc)']),
('9fc8877c-b046-5127-9471-c6e65ff44d65','PMAX (Microsoft)','32b2c2a5-9821-560b-970e-ce7f571743fe',70,'thebrief:6422:1768984',ARRAY['Performance Max','PMAX (Microsoft)']),
('52230134-db19-5dec-bc38-7d8b33b97989','Peugeot',NULL,71,'thebrief:6422:1768984',ARRAY['Peugeot']),
('c2805a40-8ab8-5f72-9947-e1c3e6281cff','Polaris',NULL,72,'thebrief:6422:1768984',ARRAY['Polaris']),
('207950c6-0be7-5717-89ee-08e0e27e6b8f','Ram',NULL,73,'thebrief:6422:1768984',ARRAY['Ram']),
('06387c03-7a6f-5e43-8fc7-035ed7422f2b','Reelmotion',NULL,74,'thebrief:6422:1768984',ARRAY['Reelmotion']),
('2cd95d96-6c28-587e-9f51-f50ed16104aa','Renault',NULL,75,'thebrief:6422:1768984',ARRAY['Renault']),
('4abe2817-b405-5adf-89d3-0c570b9b734c','Robo',NULL,76,'thebrief:6422:1768984',ARRAY['Robo']),
('be909f1c-4043-587f-bd84-8f87dc5484c0','Rowanos Restaurant',NULL,77,'thebrief:6422:1768984',ARRAY['Rowanos Restaurant']),
('5313ec9d-4389-5221-8eca-7b601678865f','Sale Motor Group',NULL,78,'thebrief:6422:1768984',ARRAY['Sale Motor Group']),
('c35046e9-391d-5b91-8c0b-a25f12b547e5','SKODA',NULL,79,'thebrief:6422:1768984',ARRAY['SKODA']),
('5936e9ef-b22e-5039-b9d9-cd5686e9a7bd','Social Media Templates',NULL,80,'thebrief:6422:1768984',ARRAY['Social Media Templates']),
('c79100cd-6734-5c76-abec-201decab4099','Archived Templates','5936e9ef-b22e-5039-b9d9-cd5686e9a7bd',81,'thebrief:6422:1768984',ARRAY['Social Media Templates','Archived Templates']),
('a7a57ac5-feb0-5c74-b771-bc0b0cfbed1e','Customer Reviews','c79100cd-6734-5c76-abec-201decab4099',82,'thebrief:6422:1768984',ARRAY['Social Media Templates','Archived Templates','Customer Reviews']),
('6446f3ff-0fcd-581b-9ad7-73e85527c96a','Delivery Templates','c79100cd-6734-5c76-abec-201decab4099',83,'thebrief:6422:1768984',ARRAY['Social Media Templates','Archived Templates','Delivery Templates']),
('4a7d98d1-27f8-5c97-a2eb-1a1aca47e0c1','Updates','c79100cd-6734-5c76-abec-201decab4099',84,'thebrief:6422:1768984',ARRAY['Social Media Templates','Archived Templates','Updates']),
('59aaeac5-dd88-53ab-bb5b-4fb785dd43e4','Customer Reviews','5936e9ef-b22e-5039-b9d9-cd5686e9a7bd',85,'thebrief:6422:1768984',ARRAY['Social Media Templates','Customer Reviews']),
('51a83b1a-9572-5bfa-b6a0-9cdccc1eae86','Delivery Photos','5936e9ef-b22e-5039-b9d9-cd5686e9a7bd',86,'thebrief:6422:1768984',ARRAY['Social Media Templates','Delivery Photos']),
('bee59d64-0e27-581f-bf89-c33285fb7bca','Footy Tipping','5936e9ef-b22e-5039-b9d9-cd5686e9a7bd',87,'thebrief:6422:1768984',ARRAY['Social Media Templates','Footy Tipping']),
('1ff7f306-8cef-5a8e-afec-11ce5c3a89fb','Updates','5936e9ef-b22e-5039-b9d9-cd5686e9a7bd',88,'thebrief:6422:1768984',ARRAY['Social Media Templates','Updates']),
('42695a32-0d0c-5c79-8558-1feb0ea087bc','South Morang Motor Group',NULL,89,'thebrief:6422:1768984',ARRAY['South Morang Motor Group']),
('a5b69244-527d-582a-b71e-a221807fcff4','Subaru',NULL,90,'thebrief:6422:1768984',ARRAY['Subaru']),
('148ee009-58a9-5d63-b6a3-66d023ea70b8','Suzuki',NULL,91,'thebrief:6422:1768984',ARRAY['Suzuki']),
('8bf06574-8155-5bd8-badb-8552e8bcb3be','The Big Garage',NULL,92,'thebrief:6422:1768984',ARRAY['The Big Garage']),
('11829284-50e6-5345-8e34-b365e114380d','The Touring Hub',NULL,93,'thebrief:6422:1768984',ARRAY['The Touring Hub']),
('8b45cace-70c7-5a02-8900-dc236dba7ebc','Toyota',NULL,94,'thebrief:6422:1768984',ARRAY['Toyota']),
('d1c7df3e-897a-55dd-b262-e0b2ac974042','Traralgon Automotive Group',NULL,95,'thebrief:6422:1768984',ARRAY['Traralgon Automotive Group']),
('4530f5a9-bf41-52e0-8aba-454607bf5158','Urban Caravans',NULL,96,'thebrief:6422:1768984',ARRAY['Urban Caravans']),
('29982d60-427d-5311-ba96-22364dd81a01','Victorian RV Sales',NULL,97,'thebrief:6422:1768984',ARRAY['Victorian RV Sales']),
('719bc47a-2a95-5d3b-8c09-83d95b5d1f1b','Volkswagen',NULL,98,'thebrief:6422:1768984',ARRAY['Volkswagen']),
('b0830bbb-8d4d-5d99-8d02-a37993deb0cd','Volvo',NULL,99,'thebrief:6422:1768984',ARRAY['Volvo']),
('fc1ffe5a-f063-556b-a69c-ba46b48f6938','XPeng',NULL,100,'thebrief:6422:1768984',ARRAY['XPeng'])
ON CONFLICT (source, source_path) DO NOTHING;

-- Match only one exact recorded source path. Slashes within a root name remain literal
-- in source_path, e.g. FNQ / Brighton Motor Group. Do not guess by client or name.
WITH candidates AS (
  SELECT p.id AS project_id, min(f.id::text)::uuid AS folder_id
  FROM banner_projects p
  JOIN banner_folders f ON f.source = 'thebrief:6422:1768984'
    AND ('source-folder:' || array_to_string(f.source_path, '/')) = ANY(p.tags)
  WHERE p.folder_id IS NULL
  GROUP BY p.id HAVING count(*) = 1
)
UPDATE banner_projects p SET folder_id = c.folder_id
FROM candidates c WHERE p.id = c.project_id AND p.folder_id IS NULL;
COMMIT;
