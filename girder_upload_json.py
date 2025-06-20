import girder_client, glob, json, sys,tqdm


gc = girder_client.GirderClient(apiUrl='https://athena.rc.ufl.edu/api/v1')
gc.authenticate(apiKey='MyNCrDpx4y31ndtadL3UIUOXCZhCf9SEHcy9YSv4')
LN_dsa_folder='67126bfebd4e0f94a4cfc1f0'
Tx_dsa_folder='67126c0dbd4e0f94a4cfc20e'


LN_slides=gc.listItem(LN_dsa_folder)
Tx_slides=gc.listItem(Tx_dsa_folder)
LN_json_path='/home/br.ginley/LN_json/'
Tx_json_path='/home/br.ginley/Tx_json/'
'''
for lns in tqdm.tqdm(LN_slides):
    slide_name=lns['name']
    slide_id=lns['_id']
    json_data=json.load(open(f"{LN_json_path}{slide_name.split('.svs')[0]}.json",'rb'))
    gc.post(f'/annotation/item/{slide_id}', json=json_data)
'''
for txs in tqdm.tqdm(Tx_slides):
    slide_name=txs['name']
    slide_id=txs['_id']
    json_data=json.load(open(f"{Tx_json_path}{slide_name.split('.svs')[0]}.json",'rb'))
    gc.post(f'/annotation/item/{slide_id}', json=json_data)
