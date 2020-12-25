---
title:  Document Deletion in Azure DocumentDB
author: Khaled Hikmat
author_title: Software Engineer
author_url: https://github.com/khaledhikmat
author_image_url: https://avatars1.githubusercontent.com/u/3119726?s=400&u=090899e7b366dd702f9d0d5e483f20089010b25c&v=4
tags: [CosmosDB]
---

I saw many posts about deleting documents in Azure DocumentDB...but none of them worked quite well for me. So I spent a few hours on this and finally got it to work. Below is my solution. The following posts helped me tremendously (thank you):
- [https://talkingaboutdata.wordpress.com/2015/08/24/deleting-multiple-documents-from-azure-documentdb/](https://talkingaboutdata.wordpress.com/2015/08/24/deleting-multiple-documents-from-azure-documentdb/)
- [https://www.tutorialspoint.com/documentdb/documentdb_delete_document.htm](https://www.tutorialspoint.com/documentdb/documentdb_delete_document.htm)
- [http://stackoverflow.com/questions/29137708/how-to-delete-all-the-documents-in-documentdb-through-c-sharp-code](http://stackoverflow.com/questions/29137708/how-to-delete-all-the-documents-in-documentdb-through-c-sharp-code)
- [https://azure.microsoft.com/en-us/blog/working-with-dates-in-azure-documentdb-4/](https://azure.microsoft.com/en-us/blog/working-with-dates-in-azure-documentdb-4/)

I basically wanted to delete aging documents (based on number of hours) from a collection. So my final routine looks like this. Below is some explanation:

```
public async Task<int> DeleteAgingDocuments(Uri docDbUri, string docDbKey, string databaseName, string collectionName, int hours)
{
    using (var client = new DocumentClient(docDbUri, docDbKey))
    {
		try
		{
	        var dbs = this._docDbClient.CreateDatabaseQuery().ToList();
	        if (dbs == null)
	            throw new Exception("No databases in the Docdb account!");
	        var db = dbs.Where(d => d.Id == databaseName).FirstOrDefault();
	        if (db == null)
	            throw new Exception($"No database [{databaseName}] in the Docdb account!");
	        var collections = this._docDbClient.CreateDocumentCollectionQuery(db.CollectionsLink).ToList();
	        if (collections == null)
	            throw new Exception($"No collections in the [{databaseName}] database in the Docdb account!");
	        var collection = this._docDbClient.CreateDocumentCollectionQuery(db.CollectionsLink).Where(c => c.Id == collectionName).ToList().FirstOrDefault();
	        if (collection == null)
	            throw new Exception($"No collection [{collectionName}] in the [{databaseName}] database in the Docdb account!");

            int epocDateTime = DateTime.UtcNow.AddHours(-1 * hours).ToEpoch();
            var dbQuery = "SELECT VALUE {\"link\": c._self, \"source\": c.source} FROM c WHERE c._ts < " + epocDateTime;
            var docs = this._docDbClient.CreateDocumentQuery(collection.SelfLink, dbQuery, new FeedOptions { EnableCrossPartitionQuery = true }).ToList();
            foreach (var doc in docs)
            {
                var link = (string)doc.link;
                var source = (string)doc.source;
                await this._docDbClient.DeleteDocumentAsync(link, new RequestOptions() { PartitionKey = new Microsoft.Azure.Documents.PartitionKey(source) });
            }

            return docs.Count;
		}
		catch (Exception ex)
		{
			// some debug 
		}
    }
}
```

### Time

The first problem I encountered is how to select the aging documents! It turned out the best way to do this is to compare numbers as opposed to dates. This [post](https://azure.microsoft.com/en-us/blog/working-with-dates-in-azure-documentdb-4/) helped me understand what the problem is and how to go around doing it properly. I ended it up using the built-in time stamp value stored as meta data in every DocDB document i.e. `_ts`. This may or may not work for every case. In my case my collection document date i.e. `eventDate` is actually the real UTC time ....so it was no problem. If this is not the case, you many need to store your own time stamp (in addition to the date) so u can do the query to pull the aging documents based on time. 

so this query does exactly that:
```
int epocDateTime = DateTime.UtcNow.AddHours(-1 * hours).ToEpoch();
var dbQuery = $"SELECT * FROM c WHERE c._ts < {epocDateTime}";
```

Notice how I am using the Epoc time for my aging time stamp. The `DateTime` extension is written this way:

```
public static int ToEpoch(this DateTime date)
{
    if (date == null) return int.MinValue;
    DateTime epoch = new DateTime(1970, 1, 1);
    TimeSpan epochTimeSpan = date - epoch;
    return (int)epochTimeSpan.TotalSeconds;
}
```

### Partition Key

My collection was partitioned over a value in the document i.e. `source`, but I wanted to trim all aging documents across all partitions...not against a single partition. So I used this query options to force the query to span multiple partitions:

```
FeedOptions queryOptions = new FeedOptions { EnableCrossPartitionQuery = true };
```

### Deletion

Finally, I wanted to loop through all aging documents and delete:

```
int epocDateTime = DateTime.UtcNow.AddHours(-1 * hours).ToEpoch();
var dbQuery = "SELECT VALUE {\"link\": c._self, \"source\": c.source} FROM c WHERE c._ts < " + epocDateTime;
var docs = this._docDbClient.CreateDocumentQuery(collection.SelfLink, dbQuery, new FeedOptions { EnableCrossPartitionQuery = true }).ToList();
foreach (var doc in docs)
{
    var link = (string)doc.link;
    var source = (string)doc.source;
    await this._docDbClient.DeleteDocumentAsync(link, new RequestOptions() { PartitionKey = new Microsoft.Azure.Documents.PartitionKey(source) });
}
```

#### Query

Please note that the query that I used above uses a projection to get only the document link and the partition key....we really do not need the entire document:

```
var dbQuery = "SELECT VALUE {\"link\": c._self, \"source\": c.source} FROM c WHERE c._ts < " + epocDateTime;
```

Also please note that I am using the `VALUE` modifier in the query so to force DocDB to return the value only. This will return a payload that looks like this:

```
[
  {
    "link": "dbs/XEthAA==/colls/XEthAL4dCwA=/docs/XEthAL4dCwABAAAAAAAAAA==/",
    "source": "Digital Controller"
  },
  {
    "link": "dbs/XEthAA==/colls/XEthAL4dCwA=/docs/XEthAL4dCwACAAAAAAAAAA==/",
    "source": "Profiler"
  }
]
```

If I don't include the `VALUE` modifier, I get this:

```
[
  {
    "$1": {
      "link": "dbs/XEthAA==/colls/XEthAL4dCwA=/docs/XEthAL4dCwABAAAAAAAAAA==/",
      "source": "Digital Controller"
    }
  },
  {
    "$1": {
      "link": "dbs/XEthAA==/colls/XEthAL4dCwA=/docs/XEthAL4dCwACAAAAAAAAAA==/",
      "source": "Profiler"
    }
  }
]
```

I chose the first one :-)  

#### Deletion

Finally, we pull the documents and delete one at a time:

```
var docs = this._docDbClient.CreateDocumentQuery(collection.SelfLink, dbQuery, new FeedOptions { EnableCrossPartitionQuery = true }).ToList();
foreach (var doc in docs)
{
    var link = (string)doc.link;
    var source = (string)doc.source;
    await this._docDbClient.DeleteDocumentAsync(link, new RequestOptions() { PartitionKey = new Microsoft.Azure.Documents.PartitionKey(source) });
}
```

Initially, I only got the document link from the query thinking that this was the only requirement. So I did something like this:

```
var dbQuery = "SELECT VALUE c._self FROM c WHERE c._ts < " + epocDateTime;
var docs = this._docDbClient.CreateDocumentQuery(collection.SelfLink, dbQuery, new FeedOptions { EnableCrossPartitionQuery = true }).ToList();
foreach (var doc in docs)
{
    await this._docDbClient.DeleteDocumentAsync(doc);
}
```

This did not work! I needed to pass the partition key....this is why i changed the query to a projection so I can get the partition key. In my case the partition key is the `source`. There is a comment in this [post](http://stackoverflow.com/questions/29137708/how-to-delete-all-the-documents-in-documentdb-through-c-sharp-code) that gave me a clue that the request option must include the partition key.

Thank you for reading! I hope this helps someone. 